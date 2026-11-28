// Exercises permanent deletion end to end against the local API.
// Creates throwaway accounts/institutions, checks every guard, then cleans up.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const env = readFileSync('.env', 'utf8')
const databaseUrl = env.match(/^DATABASE_URL=(.*)$/m)[1].trim()
const adminEmail = env.match(/^BOOTSTRAP_ADMIN_EMAIL=(.*)$/m)[1].trim()
const adminPassword = env.match(/^BOOTSTRAP_ADMIN_PASSWORD=(.*)$/m)[1].trim()
const API = 'http://127.0.0.1:8787'
const ORIGIN = 'http://localhost:5174'

const db = new Client({ connectionString: databaseUrl })
await db.connect()

let pass = 0, fail = 0
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}`) }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`) }
}

async function api(method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const setCookie = res.headers.get('set-cookie') || ''
  const match = setCookie.match(/guardian_session=([^;]+)/)
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json, cookie: match ? `guardian_session=${match[1]}` : cookie }
}

const login = async () => {
  const res = await api('POST', '/api/auth/login', { identifier: adminEmail, password: adminPassword, role: 'Platform admin' })
  if (res.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(res.json)}`)
  return res.cookie
}

const admin = await login()

// ---- fixtures -------------------------------------------------------------
const uniq = Date.now().toString(36)
const mkUser = async (name, email) => (await db.query(
  `INSERT INTO users(id,full_name,email,password_hash,status,created_at,updated_at)
   VALUES($1,$2,$3,'x','active',now(),now()) RETURNING id`,
  [randomUUID(), name, email])).rows[0].id

const emptyUser = await mkUser('Temp Empty User', `temp-empty-${uniq}@example.test`)
const busyUser = await mkUser('Temp Busy Teacher', `temp-busy-${uniq}@example.test`)
const instId = `test-inst-${uniq}`
await db.query(`INSERT INTO institutions(id,name,status,created_at,updated_at) VALUES($1,$2,'active',now(),now())`, [instId, `Temp Test School ${uniq}`])
await db.query(`INSERT INTO user_roles(id,user_id,role,institution_id,created_at) VALUES($1,$2,'Teacher',$3,now())`, [randomUUID(), busyUser, instId])

// A submission for the busy teacher makes their deletion illegal.
const submissionId = randomUUID()
await db.query(
  `INSERT INTO marketplace_submissions(id,teacher_user_id,institution_id,title,description,curriculum,level,grade,subject,academic_year,term,assessment_type,resource,price_kes,status,created_at,updated_at)
   VALUES($1,$2,$3,'Temp blocking resource','A description long enough to satisfy the check constraint on the column.','CBC','Junior','Grade 7','Maths','2026','Term 1','Exam','Paper',100,'draft',now(),now())`,
  [submissionId, busyUser, instId])

// Every institution fixture also needs an assessment to prove that blocker.
const assessId = randomUUID()
await db.query(
  `INSERT INTO assessments(id,teacher_user_id,institution_id,title,join_code,status,created_at,updated_at)
   VALUES($1,$2,$3,'Temp assessment','TJ'||substr(md5(random()::text),1,8),'draft',now(),now())`,
  [assessId, busyUser, instId]).catch(async (error) => { console.log('  (assessment fixture skipped:', error.message, ')') })

console.log('\n1. Preview deletion for a clean account')
const preview = await api('GET', `/api/admin/users/${emptyUser}/deletion`, null, admin)
check('returns 200', preview.status === 200, JSON.stringify(preview.json))
check('reports deletable', preview.json.deletable === true)
check('no blockers', Array.isArray(preview.json.blockers) && preview.json.blockers.length === 0)

console.log('\n2. Preview deletion for an account with data')
const blocked = await api('GET', `/api/admin/users/${busyUser}/deletion`, null, admin)
check('returns 200', blocked.status === 200)
check('not deletable', blocked.json.deletable === false)
check('lists blocking submissions', blocked.json.blockers?.some((item) => item.code === 'TEACHER_HAS_SUBMISSIONS'), JSON.stringify(blocked.json.blockers))

console.log('\n3. Hard delete is refused while data exists')
const refused = await api('DELETE', `/api/admin/users/${busyUser}`, { confirm: true }, admin)
check('returns 409', refused.status === 409, `got ${refused.status}`)
check('error code', refused.json.error?.code === 'TEACHER_HAS_SUBMISSIONS', refused.json.error?.code)
const stillThere = await db.query('SELECT 1 FROM users WHERE id=$1', [busyUser])
check('account still present', stillThere.rowCount === 1)

console.log('\n4. Delete requires explicit confirmation')
const noConfirm = await api('DELETE', `/api/admin/users/${emptyUser}`, {}, admin)
check('returns 400 without confirm', noConfirm.status === 400, `got ${noConfirm.status}`)

console.log('\n5. Self deletion is blocked')
const meRow = await db.query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [adminEmail])
const selfCheck = await api('GET', `/api/admin/users/${meRow.rows[0].id}/deletion`, null, admin)
check('self flagged blocked', selfCheck.json.deletable === false && selfCheck.json.blockers?.some((item) => item.code === 'SELF_DELETION_BLOCKED'))
const selfDelete = await api('DELETE', `/api/admin/users/${meRow.rows[0].id}`, { confirm: true }, admin)
check('self delete returns 409', selfDelete.status === 409, `got ${selfDelete.status}`)

console.log('\n6. Clean account deletes and leaves an audit trail')
// Give the clean account some history so we can prove the audit survives.
await db.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'test.fixture_action','{}'::jsonb,now())`, [randomUUID(), emptyUser])
const deleted = await api('DELETE', `/api/admin/users/${emptyUser}`, { confirm: true }, admin)
check('returns 200', deleted.status === 200, JSON.stringify(deleted.json))
const gone = await db.query('SELECT 1 FROM users WHERE id=$1', [emptyUser])
check('account removed', gone.rowCount === 0)
const history = await db.query(`SELECT actor_user_id, actor_snapshot FROM audit_events WHERE action='test.fixture_action'`)
check('audit row kept', history.rowCount === 1)
check('audit detached from deleted user', history.rows[0].actor_user_id === null)
check('audit keeps readable name', history.rows[0].actor_snapshot === 'Temp Empty User', history.rows[0].actor_snapshot)
const deleteAudit = await db.query(`SELECT details_json FROM audit_events WHERE action='admin.user_deleted' ORDER BY created_at DESC LIMIT 1`)
check('deletion is audited', deleteAudit.rowCount === 1 && deleteAudit.rows[0].details_json.email === `temp-empty-${uniq}@example.test`)

console.log('\n7. Institution deletion guard')
const instPreview = await api('GET', `/api/admin/institutions/${instId}/deletion`, null, admin)
check('returns 200', instPreview.status === 200, JSON.stringify(instPreview.json))
check('blocked by submissions', instPreview.json.deletable === false && instPreview.json.blockers?.some((item) => item.code === 'INSTITUTION_HAS_SUBMISSIONS'))
check('warns about memberships', instPreview.json.warnings?.some((text) => text.includes('member') || text.includes('account')))
const instDeleteBlocked = await api('DELETE', `/api/admin/institutions/${instId}`, { confirm: true }, admin)
check('delete refused with data', instDeleteBlocked.status === 409, `got ${instDeleteBlocked.status}`)

console.log('\n8. Unknown records')
const missing = await api('GET', `/api/admin/users/${randomUUID()}/deletion`, null, admin)
check('unknown user 404', missing.status === 404)
const missingInst = await api('GET', `/api/admin/institutions/does-not-exist/deletion`, null, admin)
check('unknown institution 404', missingInst.status === 404)

// ---- cleanup --------------------------------------------------------------
console.log('\n9. Cleanup: clear dependencies, then delete the institution')
await db.query('DELETE FROM marketplace_submissions WHERE id=$1', [submissionId])
await db.query('DELETE FROM assessments WHERE id=$1', [assessId])
const instFinal = await api('GET', `/api/admin/institutions/${instId}/deletion`, null, admin)
check('now deletable', instFinal.json.deletable === true, JSON.stringify(instFinal.json.blockers))
const instOk = await api('DELETE', `/api/admin/institutions/${instId}`, { confirm: true }, admin)
check('institution deleted', instOk.status === 200, JSON.stringify(instOk.json))
const instGone = await db.query('SELECT 1 FROM institutions WHERE id=$1', [instId])
check('institution row gone', instGone.rowCount === 0)
const roleGone = await db.query('SELECT 1 FROM user_roles WHERE institution_id=$1', [instId])
check('memberships removed', roleGone.rowCount === 0)
const userKept = await db.query('SELECT 1 FROM users WHERE id=$1', [busyUser])
check('member account kept', userKept.rowCount === 1)

const busyDelete = await api('DELETE', `/api/admin/users/${busyUser}`, { confirm: true }, admin)
check('busy user now deletable', busyDelete.status === 200, JSON.stringify(busyDelete.json))

// Remove the audit fixtures this script created.
await db.query(`DELETE FROM audit_events WHERE action IN ('test.fixture_action','admin.user_deleted','admin.institution_deleted') AND details_json->>'email' LIKE 'temp-%' OR action='test.fixture_action'`)

console.log(`\n${pass} passed, ${fail} failed`)
await db.end()
process.exit(fail === 0 ? 0 : 1)
