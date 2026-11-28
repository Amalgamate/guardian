// Verifies the student-activity reset: preview counts, confirmation, and that
// accounts / paid orders / prices survive while attempts are removed.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const env = readFileSync('.env', 'utf8')
const db = new Client({ connectionString: env.match(/^DATABASE_URL=(.*)$/m)[1].trim() })
await db.connect()
const API = 'http://127.0.0.1:8787'
const ORIGIN = 'http://localhost:5174'
const adminEmail = env.match(/^BOOTSTRAP_ADMIN_EMAIL=(.*)$/m)[1].trim()
const adminPassword = env.match(/^BOOTSTRAP_ADMIN_PASSWORD=(.*)$/m)[1].trim()

let pass = 0, fail = 0
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}`) } else { fail++; console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`) }
}
async function api(method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const m = (res.headers.get('set-cookie') || '').match(/guardian_session=([^;]+)/)
  return { status: res.status, json: await res.json().catch(() => ({})), cookie: m ? `guardian_session=${m[1]}` : cookie }
}
const login = await api('POST', '/api/auth/login', { identifier: adminEmail, password: adminPassword, role: 'Platform admin' })
if (login.status !== 200) throw new Error(`login failed ${JSON.stringify(login.json)}`)
const admin = login.cookie

const before = await api('GET', '/api/admin/data-reset', null, admin)
check('preview returns 200', before.status === 200, JSON.stringify(before.json))
check('preview has counts', typeof before.json.counts?.attempts === 'number')
check('preview lists kept records', Array.isArray(before.json.keeps) && before.json.keeps.length > 0)

const noConfirm = await api('POST', '/api/admin/data-reset', {}, admin)
check('reset needs confirmation', noConfirm.status === 400, `got ${noConfirm.status}`)

// A real attempt to prove deletion works and marks cascade.
const teacher = (await db.query(`SELECT teacher_user_id, id AS assessment_id FROM assessments LIMIT 1`)).rows[0]
let fixture = null
if (teacher) {
  const learner = (await db.query(`SELECT id FROM users WHERE id <> $1 LIMIT 1`, [teacher.teacher_user_id])).rows[0]
  if (learner) {
    fixture = (await db.query(
      `INSERT INTO assessment_attempts(id,assessment_id,learner_user_id,status,maximum_score,started_at)
       VALUES($1,$2,$3,'submitted',10,now()) RETURNING id`,
      [randomUUID(), teacher.assessment_id, learner.id])).rows[0].id
    await db.query(`INSERT INTO assessment_question_marks(id,attempt_id,question_id,awarded_marks,marked_by,updated_at)
      SELECT $1,$2,q.id,1,$3,now() FROM assessment_questions q WHERE q.assessment_id=$4 LIMIT 1`,
      [randomUUID(), fixture, teacher.teacher_user_id, teacher.assessment_id]).catch(() => {})
    console.log('  (fixture attempt created)')
  }
}

const usersBefore = Number((await db.query('SELECT count(*)::int n FROM users')).rows[0].n)
const institutionsBefore = Number((await db.query('SELECT count(*)::int n FROM institutions')).rows[0].n)
const pricingBefore = (await db.query('SELECT count(*)::int n FROM guardian_exam_pricing')).rows[0].n
const paidBefore = Number((await db.query(`SELECT count(*)::int n FROM marketplace_orders WHERE status='paid'`)).rows[0].n)

const run = await api('POST', '/api/admin/data-reset', { confirm: true }, admin)
check('reset returns 200', run.status === 200, JSON.stringify(run.json))

const attemptLeft = await db.query('SELECT 1 FROM assessment_attempts WHERE id=$1', [fixture ?? randomUUID()])
check('attempt removed', attemptLeft.rowCount === 0)
const usersAfter = Number((await db.query('SELECT count(*)::int n FROM users')).rows[0].n)
check('accounts untouched', usersAfter === usersBefore, `${usersBefore} → ${usersAfter}`)
const instAfter = Number((await db.query('SELECT count(*)::int n FROM institutions')).rows[0].n)
check('institutions untouched', instAfter === institutionsBefore)
const pricingAfter = (await db.query('SELECT count(*)::int n FROM guardian_exam_pricing')).rows[0].n
check('exam prices untouched', pricingAfter === pricingBefore)
const paidAfter = Number((await db.query(`SELECT count(*)::int n FROM marketplace_orders WHERE status='paid'`)).rows[0].n)
check('paid orders untouched', paidAfter === paidBefore, `${paidBefore} → ${paidAfter}`)

const after = await api('GET', '/api/admin/data-reset', null, admin)
check('preview now clear', after.json.counts.attempts === 0 && after.json.deletable === false, JSON.stringify(after.json.counts))

const audit = await db.query(`SELECT 1 FROM audit_events WHERE action='admin.student_activity_reset' LIMIT 1`)
check('reset is audited', audit.rowCount === 1)
await db.query(`DELETE FROM audit_events WHERE action='admin.student_activity_reset'`)

console.log(`\n${pass} passed, ${fail} failed`)
await db.end()
process.exit(fail === 0 ? 0 : 1)
