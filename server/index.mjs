import { createServer } from 'node:http'
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase } from './db.mjs'
import { resendReady, sendGuardianOtp, sendGuardianOrderReceipt, sendGuardianWelcome } from './email.mjs'
import { mobileSasaReady, sendGuardianOtpSms, sendGuardianPaymentReceiptSms } from './sms.mjs'
import { darajaConfig, DarajaRequestError, initiateStkPush, normalizeMpesaPhone } from './daraja.mjs'
import { handleAcademicStructureRequest } from './academicStructureRoutes.mjs'

const scrypt = promisify(scryptCallback)
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const marketplaceFilesDir = resolve(process.env.MARKETPLACE_FILES_DIR || join(rootDir, 'private-marketplace-files'))
const marketplaceFileMaxBytes = 50 * 1024 * 1024
await loadEnv(resolve(rootDir, '.env'))

const roles = ['Learner', 'Parent', 'Teacher', 'School admin', 'Platform admin', 'Examiner']
const rolePermissions = {
  Learner: ['learning:read', 'practice:write', 'orders:read:self', 'inbox:use'],
  Parent: ['children:read:linked', 'reports:read:linked', 'orders:read:self', 'inbox:use'],
  Teacher: ['classes:read:assigned', 'assessments:manage:assigned', 'marking:manage:assigned', 'marketplace:submit:self', 'wallet:read:self', 'inbox:use'],
  'School admin': ['school:manage:own', 'staff:manage:own', 'learners:manage:own', 'reports:read:own', 'inbox:use'],
  'Platform admin': ['platform:manage', 'users:manage', 'roles:grant', 'institutions:manage', 'content:moderate', 'payouts:approve', 'inbox:manage'],
  Examiner: ['content:read:assigned', 'content:edit:assigned', 'marking-schemes:manage:assigned', 'inbox:use'],
}
const publicRoles = new Set(['Learner', 'Parent'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^\+[1-9]\d{7,14}$/
const passwordMinLength = 12
const sessionDays = Math.min(Math.max(Number(process.env.SESSION_MAX_DAYS || 7), 1), 30)
const marketplaceVendorSharePercent = Number(process.env.MARKETPLACE_VENDOR_SHARE_PERCENT || 80)
if (!Number.isFinite(marketplaceVendorSharePercent) || marketplaceVendorSharePercent < 0 || marketplaceVendorSharePercent > 100) throw new Error('MARKETPLACE_VENDOR_SHARE_PERCENT must be between 0 and 100.')
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5174'
const isProduction = process.env.NODE_ENV === 'production'
const otpDelivery = process.env.OTP_DELIVERY || 'console'

if (!['console', 'resend'].includes(otpDelivery)) throw new Error('OTP_DELIVERY must be console or resend.')
if (isProduction && otpDelivery !== 'resend') throw new Error('Production requires OTP_DELIVERY=resend. Console OTP is development-only.')
if (otpDelivery === 'resend' && !resendReady()) throw new Error('OTP_DELIVERY=resend requires RESEND_API_KEY and a sender address (RESEND_FROM_EMAIL or EMAIL_FROM).')

const db = createDatabase({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' })
try {
  await db.query('SELECT 1')
  await db.migrate()
} catch (error) {
  await db.end()
  throw new Error(`Could not connect to PostgreSQL or apply database migrations. Check DATABASE_URL, server status, and database permissions. ${error.message}`)
}
console.info('Connected to PostgreSQL.')

function prepare(sql) {
  let parameter = 0
  const query = sql.replace(/\?/g, () => `$${++parameter}`).replace(/(\w+)\s+IS\s+(\$\d+)/g, '$1 IS NOT DISTINCT FROM $2')
  return {
    get: async (...values) => db.one(query, values),
    all: async (...values) => db.many(query, values),
    run: async (...values) => db.query(query, values),
  }
}

const q = {
  userByEmail: prepare('SELECT * FROM users WHERE email_normalized = ?'),
  userByPhone: prepare('SELECT * FROM users WHERE phone_normalized = ?'),
  userById: prepare('SELECT * FROM users WHERE id = ?'),
  roles: prepare('SELECT role, institution_id AS "institutionId" FROM user_roles WHERE user_id = ? ORDER BY role'),
  role: prepare('SELECT 1 AS found FROM user_roles WHERE user_id = ? AND role = ? AND institution_id IS ?'),
  sessionByHash: prepare(`SELECT s.*,u.full_name,u.email,u.phone,u.status,u.email_verified_at,u.phone_verified_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`),
  audit: prepare('INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES(?,?,?,?,?,?)'),
}

const buckets = new Map()
const authSecret = process.env.AUTH_OTP_PEPPER || randomBytes(32).toString('hex')
if (isProduction && !process.env.AUTH_OTP_PEPPER) throw new Error('Set AUTH_OTP_PEPPER to a stable secret of at least 32 random bytes in production.')

await bootstrapPlatformAdmin()

function now() { return new Date().toISOString() }
function expiry(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString() }
function normalizeEmail(value) { return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null }
function normalizePhone(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (trimmed.startsWith('+')) return trimmed.replace(/[\s()-]/g, '')
  const digits = trimmed.replace(/\D/g, '')
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`
  return trimmed.replace(/[\s()-]/g, '')
}
function hashToken(value) { return createHash('sha256').update(value).digest('hex') }
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  try { return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')) } catch { return false }
}
function hashOtp(challengeId, code) { return createHash('sha256').update(`${authSecret}:${challengeId}:${code}`).digest('hex') }
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })
  return `scrypt$32768$8$1$${salt}$${Buffer.from(derived).toString('hex')}`
}
async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, expected] = String(stored).split('$')
  if (scheme !== 'scrypt' || !salt || !expected) return false
  try {
    const actual = Buffer.from(await scrypt(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 }))
    const expectedBuffer = Buffer.from(expected, 'hex')
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
  } catch { return false }
}
async function safeUser(user, userRoles) {
  const assignedRoles = userRoles || await q.roles.all(user.id)
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    emailVerified: Boolean(user.email_verified_at),
    phoneVerified: Boolean(user.phone_verified_at),
    roles: assignedRoles,
  }
}
async function audit(action, subjectUserId = null, actorUserId = null, details = {}) {
  await q.audit.run(randomUUID(), actorUserId, action, subjectUserId, JSON.stringify(details), now())
}
function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  response.end(JSON.stringify(body))
}
function fail(status, code, message, details) { const error = new Error(message); error.status = status; error.code = code; error.details = details; throw error }
function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2)) }
function cookieHeader(token, maxAge) {
  return `guardian_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`
}
function clearCookie() { return `guardian_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}` }
function marketplaceStoredPath(storageKey) {
  if (typeof storageKey !== 'string' || !/^[0-9a-f-]{36}\.(pdf|zip)$/.test(storageKey)) return null
  return join(marketplaceFilesDir, storageKey)
}
function safeMarketplaceFilename(value, extension = '') {
  const base = typeof value === 'string' ? value.normalize('NFKC').replace(/[\\/\r\n\u0000-\u001f]/g, '_').replace(/[^A-Za-z0-9._ -]/g, '').replace(/\.\./g, '').trim().slice(0, 140) : ''
  if (!extension) return base || 'exam-paper'
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base || 'exam-paper'}.${extension}`
}
function sendPrivateMarketplaceFile(response, content, mimeType, filename) {
  const dispositionName = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A')
  response.writeHead(200, { 'Content-Type': mimeType, 'Content-Length': content.length, 'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._ -]/g, '_')}"; filename*=UTF-8''${dispositionName}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(content)
}
async function respondWithMarketplaceFile(response, storageKey, filename, mimeType) {
  const storedPath = marketplaceStoredPath(storageKey)
  if (!storedPath) fail(404, 'MARKETPLACE_FILE_NOT_FOUND', 'No uploaded print master is available for this record.')
  let content
  try { content = await readFile(storedPath) } catch { fail(404, 'MARKETPLACE_FILE_NOT_FOUND', 'The uploaded print master is missing from private storage.') }
  sendPrivateMarketplaceFile(response, content, mimeType || (storageKey.endsWith('.zip') ? 'application/zip' : 'application/pdf'), safeMarketplaceFilename(filename, storageKey.endsWith('.zip') ? 'zip' : 'pdf'))
}
async function notifyMarketplaceOrderWhatsApp(orderId, event) {
  const hook = process.env.WHATSAPP_ORDER_WEBHOOK_URL
  const token = process.env.WHATSAPP_ORDER_WEBHOOK_TOKEN
  if (!hook || !token) return
    let url
    try { url = new URL(hook) } catch { console.error('WhatsApp order webhook skipped: invalid URL.'); return }
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1','whatsapp-bot','baileys'].includes(url.hostname)) {
    console.error('WhatsApp order webhook skipped: use HTTPS or an internal Docker host.')
    return
  }
  const order = await db.one(`SELECT id,recipient_name AS "recipientName",recipient_phone AS "recipientPhone",delivery_address AS "deliveryAddress",whatsapp_updates_opt_in AS "whatsappUpdatesOptIn",fulfillment_status AS "fulfillmentStatus",carrier_name AS "carrierName",tracking_code AS "trackingCode",tracking_url AS "trackingUrl"
    FROM marketplace_orders WHERE id=$1`, [orderId])
  if (!order?.whatsappUpdatesOptIn || !order.recipientPhone) return
  const labels = { paid: 'payment confirmed; your exam papers are queued for printing', printing: 'your exam papers are now being printed', ready_for_dispatch: 'your exam papers are packed and ready for dispatch', dispatched: 'your exam papers have been dispatched', delivered: 'your exam papers have been marked delivered' }
  const lines = [`Guardian Exams order ${order.id.slice(0,8).toUpperCase()}: ${labels[event] || 'order status updated'}.`]
  if (event === 'dispatched' && order.carrierName) lines.push(`Carrier: ${order.carrierName}${order.trackingCode ? ` · tracking: ${order.trackingCode}` : ''}${order.trackingUrl ? ` · ${order.trackingUrl}` : ''}`)
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event: 'marketplace_order_update', orderId: order.id, recipientName: order.recipientName, recipientPhone: order.recipientPhone, message: lines.join('\n'), fulfillmentStatus: order.fulfillmentStatus, carrierName: order.carrierName, trackingCode: order.trackingCode, trackingUrl: order.trackingUrl }), signal: controller.signal })
    if (!response.ok) console.error(`WhatsApp order webhook returned HTTP ${response.status} for order ${order.id}.`)
  } catch (error) { console.error(`WhatsApp order webhook failed for order ${order.id}:`, error instanceof Error ? error.message : 'unknown error') }
  finally { clearTimeout(timeout) }
}
async function bodyJson(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > 1_048_576) fail(413, 'BODY_TOO_LARGE', 'Request body is too large.')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail(400, 'INVALID_JSON', 'Request body must be valid JSON.') }
}
function checkOrigin(request) {
  const origin = request.headers.origin
  if (origin && origin !== webOrigin) fail(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to call the API.')
}
function rateLimit(request, bucket, limit, windowMs = 60_000, subject = '') {
  const subjectKey = subject ? `:${hashToken(subject).slice(0, 20)}` : ''
  const key = `${bucket}:${request.socket.remoteAddress || 'unknown'}${subjectKey}`
  const current = buckets.get(key)
  const stamp = Date.now()
  if (!current || stamp >= current.until) buckets.set(key, { count: 1, until: stamp + windowMs })
  else if (++current.count > limit) fail(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', { retryAfterSeconds: Math.ceil((current.until - stamp) / 1000) })
  if (buckets.size > 10_000) for (const [entry, value] of buckets) if (stamp > value.until) buckets.delete(entry)
}
function validPassword(password) {
  return typeof password === 'string' && password.length >= passwordMinLength && Buffer.byteLength(password, 'utf8') <= 128
}
function marketplaceSubmissionFields(payload = {}) {
  const text = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
  const title = text(payload.title, 180)
  const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 4000) : ''
  const curriculum = text(payload.curriculum, 120)
  const level = text(payload.level, 80)
  const grade = text(payload.grade, 80)
  const subject = text(payload.subject, 120)
  const productType = payload.productType === 'series' ? 'series' : 'single_paper'
  const includedSubjects = Array.isArray(payload.includedSubjects) ? [...new Set(payload.includedSubjects.map((value) => text(value, 120)).filter(Boolean))].slice(0, 30) : []
  const academicYear = text(payload.year ?? payload.academicYear, 12)
  const term = text(payload.term, 80)
  const assessmentType = text(payload.type ?? payload.assessmentType, 100)
  const resource = text(payload.resource, 100)
  const pageCount = Number(payload.pages ?? payload.pageCount ?? 0)
  const questionCount = Number(payload.questions ?? payload.questionCount ?? 0)
  const formats = Array.isArray(payload.formats) ? [...new Set(payload.formats.filter((value) => ['PDF', 'Word', 'Digital'].includes(value)))] : []
  const priceKes = Number(payload.price ?? payload.priceKes)
  const sampleFileLabel = typeof payload.fileName === 'string' ? payload.fileName.trim().replace(/[^A-Za-z0-9._ -]/g, '').replace(/\.\./g, '').slice(0, 180) || null : null
  const rightsConfirmed = payload.rightsConfirmed === true
  if (title.length < 4) fail(400, 'SUBMISSION_TITLE_INVALID', 'Enter a resource title between 4 and 180 characters.')
  if (description.length < 20) fail(400, 'SUBMISSION_DESCRIPTION_INVALID', 'Add at least 20 characters describing the resource and what it includes.')
  if (curriculum.length < 2 || !level || !grade || subject.length < 2 || academicYear.length < 4 || term.length < 2 || assessmentType.length < 2 || resource.length < 2) fail(400, 'SUBMISSION_METADATA_REQUIRED', 'Complete the curriculum, level, grade, subject, academic year, term, assessment type and resource fields.')
  if (!Number.isInteger(pageCount) || pageCount < 0 || pageCount > 2000 || !Number.isInteger(questionCount) || questionCount < 0 || questionCount > 1000) fail(400, 'SUBMISSION_COUNTS_INVALID', 'Enter valid page and question counts.')
  if (!Number.isFinite(priceKes) || priceKes < 0 || priceKes > 1_000_000) fail(400, 'SUBMISSION_PRICE_INVALID', 'Enter a price from KSh 0 to KSh 1,000,000.')
  if (productType === 'series' && includedSubjects.length < 2) fail(400, 'SERIES_SUBJECTS_REQUIRED', 'A series listing must name at least two included subjects.')
  return { title, description, curriculum, level, grade, subject: productType === 'series' ? 'Complete series' : subject, productType, includedSubjects, academicYear, term, assessmentType, resource, pageCount, questionCount, formats, priceKes, sampleFileLabel, rightsConfirmed }
}
function marketplaceCurriculumCode(value) {
  return /8\s*[-–]\s*4\s*[-–]\s*4|844|legacy/i.test(String(value || '')) ? 'KE-844' : 'KE-CBC'
}
async function requiredMarketplaceSeriesSubjects(curriculum, grade) {
    return db.many(`SELECT s.name,COALESCE(gs.marketplace_required,true) AS "marketplaceRequired" FROM academic_grade_subjects gs
    JOIN academic_grades g ON g.id=gs.grade_id JOIN academic_levels l ON l.id=g.level_id
    JOIN academic_curricula c ON c.id=l.curriculum_id JOIN academic_subjects s ON s.id=gs.subject_id
    WHERE c.code=$1 AND g.name=$2 AND g.status='active' AND l.status='active' AND c.status='active' AND s.status='active'
    ORDER BY s.name`, [marketplaceCurriculumCode(curriculum), grade])
}
async function assertCompleteMarketplaceSeries(submission) {
  if (submission.product_type !== 'series' && submission.productType !== 'series') return
  const expected = await requiredMarketplaceSeriesSubjects(submission.curriculum, submission.grade)
  if (!expected.length) fail(409, 'SERIES_REQUIREMENTS_UNAVAILABLE', `No active subject checklist is configured for ${submission.grade}. Ask an administrator to configure the curriculum catalogue.`)
  const included = new Set((submission.included_subjects ?? submission.includedSubjects ?? []).map((subject) => String(subject).trim().toLocaleLowerCase('en')))
  const required = expected.filter((subject) => subject.marketplaceRequired).map((subject) => subject.name)
  const missing = required.filter((name) => !included.has(name.toLocaleLowerCase('en')))
  if (missing.length) fail(400, 'SERIES_INCOMPLETE', 'This series is missing subjects required by the active grade catalogue.', { missingSubjects: missing })
}
const assessmentQuestionTypes = new Set(['choice', 'multi', 'boolean', 'short', 'number', 'matching', 'ordering', 'essay'])
function assessmentQuestionFields(question, position) {
  const prompt = typeof question?.prompt === 'string' ? question.prompt.trim() : ''
  const type = question?.type
  const marks = Number(question?.marks)
  const options = Array.isArray(question?.options) ? question.options.slice(0, 40) : []
  const correctAnswer = question?.correctAnswer
  const markingGuide = typeof question?.markingGuide === 'string' ? question.markingGuide.trim().slice(0, 3000) : ''
  const explanation = typeof question?.explanation === 'string' ? question.explanation.trim().slice(0, 3000) : ''
  if (!assessmentQuestionTypes.has(type) || prompt.length < 1 || prompt.length > 6000) fail(400, 'ASSESSMENT_QUESTION_INVALID', `Question ${position} needs a supported type and prompt.`)
  if (!Number.isFinite(marks) || marks <= 0 || marks > 1000) fail(400, 'ASSESSMENT_MARKS_INVALID', `Question ${position} must have marks greater than zero.`)
  if (['choice', 'multi', 'boolean'].includes(type) && options.length < 2) fail(400, 'ASSESSMENT_OPTIONS_REQUIRED', `Question ${position} needs at least two answer options.`)
  if (type !== 'essay' && correctAnswer === undefined) fail(400, 'ASSESSMENT_ANSWER_KEY_REQUIRED', `Question ${position} needs an answer key for automated marking.`)
  if (type === 'multi' && !Array.isArray(correctAnswer)) fail(400, 'ASSESSMENT_ANSWER_KEY_INVALID', `Question ${position} needs a list of correct answers.`)
  if (type === 'essay' && !markingGuide) fail(400, 'ASSESSMENT_MARKING_GUIDE_REQUIRED', `Question ${position} needs a marking guide for teacher review.`)
  return { position, prompt, type, options, correctAnswer: correctAnswer === undefined ? null : JSON.stringify(correctAnswer), markingGuide, explanation, marks }
}
function comparableAnswer(value) {
  if (Array.isArray(value)) return `[${value.map(comparableAnswer).sort().join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${comparableAnswer(value[key])}`).join(',')}}`
  if (typeof value === 'number') return String(value)
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}
function answerIsCorrect(type, actual, expected) {
  if (actual === undefined || actual === null) return false
  if (type === 'number') {
    const actualNumber = Number(actual)
    const expectedNumber = Number(expected)
    return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && Math.abs(actualNumber - expectedNumber) < 1e-6
  }
  if (type === 'ordering') return JSON.stringify(actual) === JSON.stringify(expected)
  return comparableAnswer(actual) === comparableAnswer(expected)
}
async function ensureWalletAccount(queryClient, userId) {
  await queryClient.query('INSERT INTO wallet_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [userId])
  await queryClient.one('SELECT user_id FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', [userId])
}
async function walletBalances(queryClient, userId) {
  const rows = await queryClient.many('SELECT bucket,SUM(amount_kes) AS balance FROM wallet_ledger WHERE user_id=$1 GROUP BY bucket', [userId])
  const balances = { pending: 0, available: 0, reserved: 0, paid: 0 }
  for (const row of rows) balances[row.bucket] = Math.round(Number(row.balance) * 100) / 100
  return balances
}
async function settlePaidMarketplaceOrder(tx, order, actorUserId, paymentReference, paidAt, paymentMethod) {
  const items = await tx.many('SELECT * FROM marketplace_order_items WHERE order_id=$1 ORDER BY seller_user_id,id', [order.id])
  await tx.query(`UPDATE marketplace_orders SET status='paid',fulfillment_status='processing',payment_method=$1,payment_reference=$2,paid_at=$3,updated_at=$3,payment_error=NULL
    WHERE id=$4 AND status IN ('awaiting_payment','payment_pending','payment_review')`, [paymentMethod, paymentReference, paidAt, order.id])
  for (const item of items) {
    await tx.query(`INSERT INTO seller_settlements(order_item_id,seller_user_id,amount_kes,created_at) VALUES($1,$2,$3,$4)
      ON CONFLICT(order_item_id) DO NOTHING`, [item.id, item.seller_user_id, item.seller_amount_kes, paidAt])
    if (Number(item.seller_amount_kes) > 0) {
      await ensureWalletAccount(tx, item.seller_user_id)
      await tx.query(`INSERT INTO wallet_ledger(user_id,entry_type,bucket,amount_kes,reference_type,reference_id,actor_user_id,created_at)
        VALUES($1,'sale_pending','pending',$2,'marketplace_order_item',$3,$4,$5) ON CONFLICT DO NOTHING`, [item.seller_user_id, item.seller_amount_kes, item.id, actorUserId, paidAt])
    }
  }
  await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,$3,$4::jsonb,$5)`, [randomUUID(), actorUserId, paymentMethod === 'mpesa_daraja' ? 'marketplace.mpesa_payment_confirmed' : 'marketplace.demo_payment_confirmed', JSON.stringify({ orderId: order.id, paymentReference }), paidAt])
  queueMicrotask(() => { void notifyMarketplaceOrderWhatsApp(order.id, 'paid') })
  return items
}
async function findUser(identifier) {
  const email = normalizeEmail(identifier)
  const phone = normalizePhone(identifier)
  if (email && emailPattern.test(email)) return q.userByEmail.get(email)
  if (phone && phonePattern.test(phone)) return q.userByPhone.get(phone)
  return undefined
}
async function activeContext(userId, role, institutionId = null) {
  if (!roles.includes(role) || !await q.role.get(userId, role, institutionId)) fail(403, 'ROLE_NOT_ASSIGNED', 'This account is not assigned to the selected role or institution.')
  return { role, institutionId, permissions: rolePermissions[role] }
}
async function issueChallenge({ user, purpose, channel, invitationId = null }) {
  const email = channel === 'email' ? user.email : null
  const phone = channel === 'sms' ? user.phone : null
  const destination = email || phone
  if (!destination) fail(400, 'CONTACT_REQUIRED', `Add a ${channel === 'email' ? 'verified email address' : 'mobile number'} to use this channel.`)
  const id = randomUUID()
  const code = String(randomInt(100000, 1_000_000))
  const timestamp = now()
  await prepare(`INSERT INTO auth_challenges(id,user_id,purpose,channel,destination,code_hash,invitation_id,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(id, user.id, purpose, channel, destination, hashOtp(id, code), invitationId, expiry(10), timestamp)
  const deliveryMode = await deliverOtp({ channel, destination, code, purpose, challengeId: id })
  return { challengeId: id, channel, maskedDestination: maskDestination(destination), deliveryMode }
}
async function deliverOtp({ channel, destination, code, purpose, challengeId }) {
  if (channel === 'email' && otpDelivery === 'console') {
    console.info(`[local OTP] purpose=${purpose} channel=${channel} destination=${maskDestination(destination)} code=${code}`)
    return 'console'
  }
  if (otpDelivery === 'resend' && channel === 'email') {
    await sendGuardianOtp({ to: destination, code, purpose, challengeId })
    return 'email'
  }
  if (channel === 'sms' && mobileSasaReady()) {
    await sendGuardianOtpSms({ to: destination, code, purpose, challengeId })
    return 'sms'
  }
  fail(503, 'OTP_CHANNEL_UNAVAILABLE', `${channel === 'sms' ? 'SMS' : 'Email'} code delivery is not configured for this account.`)
}
function maskDestination(destination) {
  if (destination.includes('@')) { const [local, domain] = destination.split('@'); return `${local.slice(0, 1)}***@${domain}` }
  return `${destination.slice(0, 4)}***${destination.slice(-2)}`
}
function randomInt(min, max) { return min + (randomBytes(4).readUInt32BE(0) % (max - min)) }
async function createSession(userId, role, institutionId = null) {
  await activeContext(userId, role, institutionId)
  const token = randomBytes(32).toString('base64url')
  const timestamp = now()
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString()
  await prepare('INSERT INTO sessions(id,user_id,token_hash,active_role,institution_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(randomUUID(), userId, hashToken(token), role, institutionId, expiresAt, timestamp, timestamp)
  return { token, expiresAt }
}
async function getAuth(request) {
  const token = parseCookies(request.headers.cookie).guardian_session
  if (!token) fail(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.')
  const row = await q.sessionByHash.get(hashToken(token), now())
  if (!row || row.status !== 'active') fail(401, 'SESSION_INVALID', 'Your session has expired or is no longer active.')
  const user = await q.userById.get(row.user_id)
  const context = await activeContext(user.id, row.active_role, row.institution_id)
  return { user, roles: await q.roles.all(user.id), session: row, context, tokenHash: hashToken(token) }
}
function requireRole(auth, allowed) {
  if (!allowed.includes(auth.context.role)) fail(403, 'ROLE_FORBIDDEN', 'Your active role cannot access this resource.')
}
async function otpChallenge(id, purpose) {
  const challenge = await prepare('SELECT * FROM auth_challenges WHERE id=? AND purpose=? AND consumed_at IS NULL AND expires_at>?').get(id, purpose, now())
  if (!challenge) fail(400, 'CHALLENGE_INVALID', 'The verification request has expired or is invalid. Start again.')
  if (challenge.attempts >= 5) fail(429, 'CHALLENGE_LOCKED', 'Too many incorrect codes. Request a new code.')
  return challenge
}
function genericRecoveryId() { return randomUUID() }

async function bootstrapPlatformAdmin() {
  const email = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL)
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!email && !password) return
  if (!email || !emailPattern.test(email) || !validPassword(password)) {
    throw new Error(`Bootstrap admin configuration requires a valid email and password of at least ${passwordMinLength} characters.`)
  }
  let user = await q.userByEmail.get(email)
  if (!user) {
    const stamp = now()
    const id = randomUUID()
    const passwordHash = await hashPassword(password)
    await prepare(`INSERT INTO users(id,full_name,email,email_normalized,password_hash,status,email_verified_at,created_at,updated_at)
      VALUES(?,?,?,?,?,'active',?,?,?)`).run(id, process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Administrator', email, email, passwordHash, stamp, stamp, stamp)
    await prepare('INSERT INTO user_roles(id,user_id,role,institution_id,granted_by,created_at) VALUES(?,?,?,NULL,NULL,?)').run(randomUUID(), id, 'Platform admin', stamp)
    user = await q.userById.get(id)
    await audit('platform_admin.bootstrap', id, id)
    console.info(`Bootstrapped platform admin ${email}. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment after secure secret setup.`)
  } else if (!await q.role.get(user.id, 'Platform admin', null)) {
    await prepare('INSERT INTO user_roles(id,user_id,role,institution_id,granted_by,created_at) VALUES(?,?,?,NULL,NULL,?)').run(randomUUID(), user.id, 'Platform admin', now())
  }
}

async function router(request, response) {
  const url = new URL(request.url || '/', 'http://localhost')
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method || 'GET'
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (mutating) checkOrigin(request)
  const marketplaceUploadMatch = path.match(/^\/api\/teacher\/marketplace-submissions\/([0-9a-f-]{36})\/file$/i)
  if (method === 'PUT' && marketplaceUploadMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    rateLimit(request, 'marketplace-file-upload', 4, 60_000, auth.user.id)
    const submissionId = marketplaceUploadMatch[1]
    const submission = await db.one(`SELECT id,status,file_storage_key AS "oldStorageKey"
      FROM marketplace_submissions WHERE id=$1 AND teacher_user_id=$2`, [submissionId, auth.user.id])
    if (!submission || !['draft','changes_requested'].includes(submission.status)) fail(404, 'EDITABLE_SUBMISSION_NOT_FOUND', 'Only your editable marketplace drafts can receive a print master.')
    const requestedName = safeMarketplaceFilename(url.searchParams.get('filename'))
    const extension = requestedName.toLowerCase().endsWith('.zip') ? 'zip' : 'pdf'
    const originalName = safeMarketplaceFilename(requestedName, extension)
    const expectedMime = extension === 'zip' ? ['application/zip','application/x-zip-compressed'] : ['application/pdf']
    const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (!expectedMime.includes(mimeType)) fail(415, 'MARKETPLACE_FILE_TYPE_INVALID', 'Upload a PDF, or a ZIP archive containing the series print masters.')
    const announcedLength = Number(request.headers['content-length'] || 0)
    if (announcedLength > marketplaceFileMaxBytes) fail(413, 'MARKETPLACE_FILE_TOO_LARGE', 'The print master must be 50 MB or smaller.')
    const chunks = []; let totalBytes = 0
    for await (const chunk of request) {
      totalBytes += chunk.length
      if (totalBytes > marketplaceFileMaxBytes) fail(413, 'MARKETPLACE_FILE_TOO_LARGE', 'The print master must be 50 MB or smaller.')
      chunks.push(chunk)
    }
    const fileBytes = Buffer.concat(chunks)
    if (!fileBytes.length || (announcedLength && announcedLength !== fileBytes.length)) fail(400, 'MARKETPLACE_FILE_EMPTY', 'The uploaded print master was empty or incomplete.')
    const signatureValid = extension === 'pdf' ? fileBytes.subarray(0,5).toString('ascii') === '%PDF-' : fileBytes.length >= 4 && fileBytes[0] === 0x50 && fileBytes[1] === 0x4b && [0x03,0x05,0x07].includes(fileBytes[2]) && [0x04,0x06,0x08].includes(fileBytes[3])
    if (!signatureValid) fail(415, 'MARKETPLACE_FILE_SIGNATURE_INVALID', 'The file contents do not match the selected PDF or ZIP type.')
    const storageKey = `${randomUUID()}.${extension}`
    const storedPath = marketplaceStoredPath(storageKey)
    await mkdir(marketplaceFilesDir, { recursive: true, mode: 0o700 })
    await writeFile(storedPath, fileBytes, { flag: 'wx', mode: 0o600 })
    const checksum = createHash('sha256').update(fileBytes).digest('hex')
    try {
      const uploaded = await db.one(`UPDATE marketplace_submissions SET file_storage_key=$1,uploaded_file_name=$2,file_mime_type=$3,file_size_bytes=$4,file_sha256=$5,sample_file_label=$2,updated_at=$6
        WHERE id=$7 AND teacher_user_id=$8 AND status IN ('draft','changes_requested')
        RETURNING id,uploaded_file_name AS "fileName",file_mime_type AS "fileMimeType",file_size_bytes AS "fileSizeBytes"`, [storageKey, originalName, mimeType, fileBytes.length, checksum, now(), submissionId, auth.user.id])
      if (!uploaded) fail(409, 'SUBMISSION_LOCKED', 'This submission is no longer editable. Refresh the page and try again.')
      if (submission.oldStorageKey) {
        const referenced = await db.one('SELECT 1 FROM marketplace_order_items WHERE file_storage_key_snapshot=$1 LIMIT 1', [submission.oldStorageKey])
        if (!referenced) { const oldPath = marketplaceStoredPath(submission.oldStorageKey); if (oldPath) await unlink(oldPath).catch(() => {}) }
      }
      await audit('marketplace.print_master_uploaded', auth.user.id, auth.user.id, { submissionId, fileName: uploaded.fileName, mimeType, fileSizeBytes: fileBytes.length, sha256: checksum })
      return sendJson(response, 201, { file: uploaded, message: 'Print master uploaded and stored privately.' })
    } catch (error) {
      await unlink(storedPath).catch(() => {})
      throw error
    }
  }
  const payload = mutating ? await bodyJson(request) : {}

  const teacherFileMatch = path.match(/^\/api\/teacher\/marketplace-submissions\/([0-9a-f-]{36})\/file$/i)
  if (method === 'GET' && teacherFileMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const file = await db.one(`SELECT file_storage_key AS "storageKey",uploaded_file_name AS "fileName",file_mime_type AS "mimeType"
      FROM marketplace_submissions WHERE id=$1 AND teacher_user_id=$2`, [teacherFileMatch[1], auth.user.id])
    if (!file?.storageKey) fail(404, 'MARKETPLACE_FILE_NOT_FOUND', 'This submission has no uploaded print master.')
    return respondWithMarketplaceFile(response, file.storageKey, file.fileName, file.mimeType)
  }

  const adminOrderFileMatch = path.match(/^\/api\/admin\/marketplace-order-items\/([0-9a-f-]{36})\/file$/i)
  if (method === 'GET' && adminOrderFileMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const file = await db.one(`SELECT oi.file_storage_key_snapshot AS "storageKey",oi.file_name_snapshot AS "fileName",oi.file_mime_type_snapshot AS "mimeType",o.status AS "orderStatus"
      FROM marketplace_order_items oi JOIN marketplace_orders o ON o.id=oi.order_id
      WHERE oi.id=$1`, [adminOrderFileMatch[1]])
    if (!file || file.orderStatus !== 'paid') fail(404, 'ORDER_PRINT_MASTER_NOT_FOUND', 'The paid order print master was not found.')
    return respondWithMarketplaceFile(response, file.storageKey, file.fileName, file.mimeType)
  }

  if (method === 'GET' && path === '/api/health') return sendJson(response, 200, { status: 'ok', service: 'guardian-auth-api', time: now() })

  if (await handleAcademicStructureRequest({ request, response, url, path, method, payload, db, prepare, getAuth, requireRole, audit, now, sendJson, fail })) return

  if (method === 'GET' && path === '/api/public/cms-settings') {
    const row = await prepare(`SELECT settings FROM admin_cms_settings WHERE setting_key='public_homepage'`).get()
    return sendJson(response, 200, { settings: row?.settings ?? null })
  }

  if (path === '/api/admin/cms-settings' && (method === 'GET' || method === 'PUT')) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    if (method === 'GET') {
      const row = await prepare(`SELECT settings,updated_at AS "updatedAt" FROM admin_cms_settings WHERE setting_key='public_homepage'`).get()
      return sendJson(response, 200, { settings: row?.settings ?? null, updatedAt: row?.updatedAt ?? null })
    }
    const supplied = payload?.settings
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) fail(400, 'CMS_SETTINGS_INVALID', 'Provide homepage content settings.')
    const settings = {
      releaseTitle: typeof supplied.releaseTitle === 'string' ? supplied.releaseTitle.trim().slice(0, 120) : '',
      announcementEnabled: supplied.announcementEnabled === true,
      heroHeading: typeof supplied.heroHeading === 'string' ? supplied.heroHeading.trim().slice(0, 140) : '',
      heroSupport: typeof supplied.heroSupport === 'string' ? supplied.heroSupport.trim().slice(0, 260) : '',
    }
    if (!settings.releaseTitle || !settings.heroHeading || !settings.heroSupport) fail(400, 'CMS_SETTINGS_REQUIRED', 'Add an announcement title, homepage heading and supporting text.')
    const saved = await prepare(`INSERT INTO admin_cms_settings(setting_key,settings,updated_by,updated_at)
      VALUES('public_homepage',?::jsonb,?,?) ON CONFLICT(setting_key) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
      RETURNING settings,updated_at AS "updatedAt"`).get(JSON.stringify(settings), auth.user.id, now())
    await audit('admin.cms_settings_updated', null, auth.user.id)
    return sendJson(response, 200, { settings: saved.settings, updatedAt: saved.updatedAt, message: 'Website copy saved.' })
  }

  if (path === '/api/admin/subscription-plans' && (method === 'GET' || method === 'PUT')) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const listPlans = () => prepare(`SELECT id,name,description,price_kes AS "priceKes",billing_interval AS "billingInterval",status,features,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM subscription_plans ORDER BY created_at,id`).all()
    if (method === 'GET') return sendJson(response, 200, { plans: await listPlans() })
    if (!Array.isArray(payload?.plans) || payload.plans.length > 100) fail(400, 'SUBSCRIPTION_PLANS_INVALID', 'Provide up to 100 subscription plans.')
    const plans = payload.plans.map((plan) => {
      const name = typeof plan?.name === 'string' ? plan.name.trim().slice(0, 100) : ''
      const description = typeof plan?.description === 'string' ? plan.description.trim().slice(0, 1000) : ''
      const interval = ['month', 'year', 'one_time'].includes(plan?.billingInterval) ? plan.billingInterval : ''
      const status = ['draft', 'active', 'archived'].includes(plan?.status) ? plan.status : ''
      const price = plan?.priceKes === null || plan?.priceKes === '' ? null : Number(plan?.priceKes)
      const features = Array.isArray(plan?.features) ? plan.features.filter((value) => typeof value === 'string').map((value) => value.trim().slice(0, 160)).filter(Boolean).slice(0, 30) : null
      if (!name || !interval || !status || (price !== null && (!Number.isFinite(price) || price < 0 || price > 10000000)) || !features || features.length !== (plan?.features?.length ?? 0)) fail(400, 'SUBSCRIPTION_PLAN_INVALID', 'Each plan needs a name, valid price, billing interval, status and text-only features.')
      return { id: /^[0-9a-f-]{36}$/i.test(plan.id ?? '') ? plan.id : randomUUID(), name, description, price, interval, status, features }
    })
    if (new Set(plans.map((plan) => plan.name.toLowerCase())).size !== plans.length) fail(400, 'SUBSCRIPTION_PLAN_DUPLICATE', 'Plan names must be unique.')
    await db.transaction(async (tx) => {
      const ids = plans.map((plan) => plan.id)
      if (ids.length) await tx.query('DELETE FROM subscription_plans WHERE NOT (id = ANY($1::uuid[]))', [ids])
      else await tx.query('DELETE FROM subscription_plans')
      for (const plan of plans) await tx.query(`INSERT INTO subscription_plans(id,name,description,price_kes,billing_interval,status,features,created_by,updated_by,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8,$9,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,price_kes=EXCLUDED.price_kes,
        billing_interval=EXCLUDED.billing_interval,status=EXCLUDED.status,features=EXCLUDED.features,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,
      [plan.id, plan.name, plan.description, plan.price, plan.interval, plan.status, JSON.stringify(plan.features), auth.user.id, now()])
    })
    await audit('admin.subscription_plans_updated', null, auth.user.id, { count: plans.length })
    return sendJson(response, 200, { plans: await listPlans(), message: 'Subscription plan definitions saved.' })
  }

  if (method === 'GET' && ['/api/admin/assessments', '/api/admin/marketplace-orders', '/api/admin/question-bank'].includes(path)) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    if (path === '/api/admin/assessments') {
      const assessments = await prepare(`SELECT a.id,a.title,a.assessment_mode AS mode,a.status,a.join_code AS "joinCode",a.created_at AS "createdAt",a.published_at AS "publishedAt",
        i.name AS "institutionName",u.full_name AS "teacherName",COUNT(DISTINCT q.id)::int AS "questionCount",COUNT(DISTINCT t.id)::int AS "attemptCount",
        ROUND(AVG(CASE WHEN t.status='published' AND t.maximum_score>0 THEN (t.auto_score/t.maximum_score)*100 END),1) AS "averageScorePercent"
        FROM assessments a JOIN institutions i ON i.id=a.institution_id JOIN users u ON u.id=a.teacher_user_id
        LEFT JOIN assessment_questions q ON q.assessment_id=a.id LEFT JOIN assessment_attempts t ON t.assessment_id=a.id
        GROUP BY a.id,i.name,u.full_name ORDER BY a.updated_at DESC LIMIT 500`).all()
      return sendJson(response, 200, { assessments })
    }
    if (path === '/api/admin/question-bank') {
      const questions = await prepare(`SELECT q.id,q.prompt,q.question_type AS "questionType",q.options,q.marks,q.created_at AS "createdAt",a.id AS "assessmentId",a.title AS "assessmentTitle",
        i.name AS "institutionName",u.full_name AS "teacherName" FROM assessment_questions q JOIN assessments a ON a.id=q.assessment_id
        JOIN institutions i ON i.id=a.institution_id JOIN users u ON u.id=a.teacher_user_id ORDER BY q.created_at DESC,q.position LIMIT 1000`).all()
      return sendJson(response, 200, { questions, source: 'assessment_questions', independentlyReusable: false })
    }
    const orders = await prepare(`SELECT o.id,o.status,o.total_kes AS "totalKes",o.delivery_fee_kes AS "deliveryFeeKes",o.recipient_name AS "recipientName",o.recipient_phone AS "recipientPhone",o.delivery_address AS "deliveryAddress",o.fulfillment_status AS "fulfillmentStatus",o.carrier_name AS "carrierName",o.tracking_code AS "trackingCode",o.tracking_url AS "trackingUrl",o.payment_method AS "paymentMethod",o.payment_reference AS "paymentReference",
      o.is_simulated_payment AS "isSimulatedPayment",o.created_at AS "createdAt",o.paid_at AS "paidAt",u.full_name AS "buyerName",u.email AS "buyerEmail",
      COALESCE(json_agg(json_build_object('id',oi.id,'submissionId',oi.submission_id,'title',oi.title_snapshot,'unitPriceKes',oi.unit_price_kes,'quantity',oi.quantity,'productType',oi.product_type,'fileName',oi.file_name_snapshot,'hasPrintMaster',oi.file_storage_key_snapshot IS NOT NULL,'sellerAmountKes',oi.seller_amount_kes,'platformAmountKes',oi.platform_amount_kes))
        FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
      FROM marketplace_orders o JOIN users u ON u.id=o.buyer_user_id LEFT JOIN marketplace_order_items oi ON oi.order_id=o.id
      GROUP BY o.id,u.full_name,u.email ORDER BY o.created_at DESC LIMIT 1000`).all()
    return sendJson(response, 200, { orders })
  }

  const marketplaceFulfillmentMatch = path.match(/^\/api\/admin\/marketplace-orders\/([0-9a-f-]+)\/fulfillment$/i)
  if (method === 'PATCH' && marketplaceFulfillmentMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const nextStatus = ['printing', 'ready_for_dispatch', 'dispatched', 'delivered'].includes(payload.status) ? payload.status : null
    if (!nextStatus) fail(400, 'FULFILLMENT_STATUS_INVALID', 'Choose a valid next fulfilment step.')
    const changedAt = now()
    const updated = await db.transaction(async (tx) => {
      const current = await tx.one('SELECT id,status,fulfillment_status FROM marketplace_orders WHERE id=$1 FOR UPDATE', [marketplaceFulfillmentMatch[1]])
      if (!current) fail(404, 'ORDER_NOT_FOUND', 'That marketplace order was not found.')
      if (current.status !== 'paid') fail(409, 'ORDER_NOT_PAID', 'Only paid orders can be marked as dispatched or delivered.')
      const transitions = { processing: 'printing', printing: 'ready_for_dispatch', ready_for_dispatch: 'dispatched', dispatched: 'delivered' }
      if (transitions[current.fulfillment_status] !== nextStatus) fail(409, 'FULFILLMENT_TRANSITION_INVALID', 'Move paid orders through printing, ready for dispatch, dispatched, then delivered.')
      const carrierName = typeof payload.carrierName === 'string' ? payload.carrierName.trim().slice(0, 120) : null
      const trackingCode = typeof payload.trackingCode === 'string' ? payload.trackingCode.trim().slice(0, 160) : null
      let trackingUrl = typeof payload.trackingUrl === 'string' ? payload.trackingUrl.trim().slice(0, 1000) : null
      if (trackingUrl) { try { const parsed = new URL(trackingUrl); if (parsed.protocol !== 'https:') throw new Error(); trackingUrl = parsed.toString() } catch { fail(400, 'TRACKING_URL_INVALID', 'Tracking links must use HTTPS.') } }
      if (nextStatus === 'dispatched' && !carrierName) fail(400, 'CARRIER_REQUIRED', 'Enter the courier name before dispatching this order.')
      return tx.one(`UPDATE marketplace_orders SET fulfillment_status=$1,carrier_name=COALESCE($2,carrier_name),tracking_code=COALESCE($3,tracking_code),tracking_url=COALESCE($4,tracking_url),updated_at=$5 WHERE id=$6 RETURNING id,fulfillment_status AS "fulfillmentStatus"`, [nextStatus, carrierName, trackingCode, trackingUrl, changedAt, current.id])
    })
    await audit(`admin.marketplace_order_${nextStatus}`, null, auth.user.id, { orderId: updated.id, fulfillmentStatus: updated.fulfillmentStatus })
    await notifyMarketplaceOrderWhatsApp(updated.id, nextStatus)
    return sendJson(response, 200, { order: updated, message: `Order marked ${nextStatus}.` })
  }

  if (method === 'GET' && path === '/api/public/guardian-exam-pricing') {
    const grades = await prepare(`SELECT grade_code AS "gradeCode",grade_label AS "gradeLabel",unit_price_kes AS "unitPriceKes" FROM guardian_exam_pricing ORDER BY CASE grade_code WHEN 'PG' THEN 0 WHEN 'PP1' THEN 1 WHEN 'PP2' THEN 2 ELSE 3 END,grade_code`).all()
    const delivery = await prepare(`SELECT setting_value AS "deliveryFeeKes" FROM guardian_exam_settings WHERE setting_key='delivery_fee_kes'`).get()
    return sendJson(response, 200, { grades, deliveryFeeKes: Number(delivery?.deliveryFeeKes ?? 300), currency: 'KES' })
  }

  if (method === 'POST' && path === '/api/public/guardian-exam-orders') {
    rateLimit(request, 'guardian-exam-order', 5, 60_000)
    const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
    const schoolName = text(payload.school, 160), contactName = text(payload.contact, 120), email = normalizeEmail(payload.email)
    const contactPhone = normalizePhone(text(payload.phone, 40)), county = text(payload.county, 100), town = text(payload.town, 100), deliveryAddress = text(payload.address, 300)
    if (!schoolName || !contactName || !email || !contactPhone || !phonePattern.test(contactPhone) || !county || !town || !deliveryAddress) fail(400, 'GUARDIAN_ORDER_DETAILS_INVALID', 'Enter the school, contact, valid phone, email and full delivery location.')
    if (!Array.isArray(payload.grades) || !payload.grades.length || payload.grades.length > 12) fail(400, 'GUARDIAN_ORDER_GRADES_INVALID', 'Choose at least one grade and enter its student quantity.')
    const requested = new Map()
    for (const row of payload.grades) {
      const gradeCode = typeof row?.gradeCode === 'string' ? row.gradeCode : ''
      const quantity = Number(row?.quantity)
      if (!/^(PG|PP1|PP2|GRADE_[1-9])$/.test(gradeCode) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || requested.has(gradeCode)) fail(400, 'GUARDIAN_ORDER_GRADES_INVALID', 'Each selected grade needs a unique student quantity from 1 to 10,000.')
      requested.set(gradeCode, quantity)
    }
    const codes = [...requested.keys()]
    const pricingSnapshot = await prepare(`SELECT
      (SELECT jsonb_agg(jsonb_build_object('gradeCode',grade_code,'gradeLabel',grade_label,'unitPriceKes',unit_price_kes)) FROM guardian_exam_pricing WHERE grade_code=ANY(?::text[])) AS grades,
      (SELECT setting_value FROM guardian_exam_settings WHERE setting_key='delivery_fee_kes') AS "deliveryFeeKes"`).get(codes)
    const priceRows = pricingSnapshot?.grades || []
    if (priceRows.length !== codes.length) fail(409, 'GUARDIAN_ORDER_PRICES_UNAVAILABLE', 'One or more selected grades are not currently available for ordering.')
    const grades = priceRows.map((row) => ({ gradeCode: row.gradeCode, gradeLabel: row.gradeLabel, quantity: requested.get(row.gradeCode), unitPriceKes: Number(row.unitPriceKes), subtotalKes: Number(row.unitPriceKes) * requested.get(row.gradeCode) }))
    const totalStudents = grades.reduce((sum, row) => sum + row.quantity, 0)
    const subtotalKes = grades.reduce((sum, row) => sum + row.subtotalKes, 0)
    const deliveryFeeKes = Number(pricingSnapshot?.deliveryFeeKes ?? 300)
    const totalKes = subtotalKes + deliveryFeeKes
    if (!Number.isSafeInteger(totalKes) || totalKes < 1 || totalKes > 100000000) fail(400, 'GUARDIAN_ORDER_TOTAL_INVALID', 'This order total is outside the supported checkout range.')
    const order = await prepare(`INSERT INTO guardian_exam_orders(school_name,contact_name,email,contact_phone,county,town,delivery_address,grades_snapshot,total_students,subtotal_kes,delivery_fee_kes,total_kes)
      VALUES(?,?,?,?,?,?,?,?::jsonb,?,?,?,?) RETURNING id,status,created_at AS "createdAt"`).get(schoolName, contactName, email, contactPhone, county, town, deliveryAddress, JSON.stringify(grades), totalStudents, subtotalKes, deliveryFeeKes, totalKes)
    await audit('guardian_exam.order_created', null, null, { orderId: order.id, totalStudents, gradeCount: grades.length, subtotalKes, deliveryFeeKes, totalKes })
    return sendJson(response, 201, { order: { ...order, grades, totalStudents, subtotalKes, deliveryFeeKes, totalKes, currency: 'KES' } })
  }

  const guardianOrderStatusMatch = path.match(/^\/api\/public\/guardian-exam-orders\/([0-9a-f-]+)$/i)
  if (method === 'GET' && guardianOrderStatusMatch) {
    const order = await prepare(`SELECT id,status,total_students AS "totalStudents",subtotal_kes AS "subtotalKes",delivery_fee_kes AS "deliveryFeeKes",total_kes AS "totalKes",grades_snapshot AS grades,payment_reference AS "paymentReference",payment_error AS "paymentError",created_at AS "createdAt",paid_at AS "paidAt" FROM guardian_exam_orders WHERE id=?`).get(guardianOrderStatusMatch[1])
    if (!order) fail(404, 'GUARDIAN_ORDER_NOT_FOUND', 'That school exam order was not found.')
    return sendJson(response, 200, { order })
  }

  const guardianOrderStkMatch = path.match(/^\/api\/public\/guardian-exam-orders\/([0-9a-f-]+)\/mpesa\/stk$/i)
  if (method === 'POST' && guardianOrderStkMatch) {
    rateLimit(request, 'guardian-exam-stk', 4, 60_000)
    if (!darajaConfig().ready) fail(503, 'MPESA_NOT_CONFIGURED', 'M-PESA checkout is not available yet. Please try again later.')
    const phone = normalizeMpesaPhone(payload.phone)
    if (!phone) fail(400, 'MPESA_PHONE_INVALID', 'Enter a valid Kenyan Safaricom number.')
    const order = await prepare(`SELECT id,total_kes AS "totalKes",status FROM guardian_exam_orders WHERE id=?`).get(guardianOrderStkMatch[1])
    if (!order) fail(404, 'GUARDIAN_ORDER_NOT_FOUND', 'That school exam order was not found.')
    if (!['awaiting_payment','payment_failed'].includes(order.status)) fail(409, 'GUARDIAN_ORDER_NOT_PAYABLE', 'This order cannot start a new payment.')
    const pending = await prepare(`UPDATE guardian_exam_orders SET status='payment_pending',payer_phone=?,payment_error=NULL,updated_at=? WHERE id=? AND status IN ('awaiting_payment','payment_failed') RETURNING id,total_kes AS "totalKes"`).get(phone, now(), order.id)
    if (!pending) fail(409, 'GUARDIAN_ORDER_NOT_PAYABLE', 'This order cannot start a new payment.')
    try {
      const started = await initiateStkPush({ phone, amount: Number(pending.totalKes), accountReference: pending.id.replaceAll('-', '').slice(0, 12).toUpperCase(), description: 'Guardian Exam' })
      await prepare(`UPDATE guardian_exam_orders SET checkout_request_id=?,merchant_request_id=?,updated_at=? WHERE id=? AND status='payment_pending'`).run(started.checkoutRequestId, started.merchantRequestId, now(), pending.id)
      return sendJson(response, 202, { order: { id: pending.id, status: 'payment_pending', totalKes: Number(pending.totalKes) }, message: started.customerMessage })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Safaricom could not start this payment.'
      if (error instanceof DarajaRequestError && error.ambiguous) {
        await prepare(`UPDATE guardian_exam_orders SET payment_error=?,updated_at=? WHERE id=? AND status='payment_pending'`).run(message.slice(0,300), now(), pending.id)
        return sendJson(response, 202, { order: { id: pending.id, status: 'payment_pending', totalKes: Number(pending.totalKes) }, message })
      }
      await prepare(`UPDATE guardian_exam_orders SET status='payment_failed',payment_error=?,updated_at=? WHERE id=? AND status='payment_pending'`).run(message.slice(0,300), now(), pending.id)
      fail(502, 'MPESA_STK_FAILED', message)
    }
  }

  if (path === '/api/admin/guardian-exam-pricing' && (method === 'GET' || method === 'PUT')) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const loadPricing = async () => ({
      grades: await prepare(`SELECT grade_code AS "gradeCode",grade_label AS "gradeLabel",unit_price_kes AS "unitPriceKes",updated_at AS "updatedAt" FROM guardian_exam_pricing ORDER BY CASE grade_code WHEN 'PG' THEN 0 WHEN 'PP1' THEN 1 WHEN 'PP2' THEN 2 ELSE 3 END,grade_code`).all(),
      deliveryFeeKes: Number((await prepare(`SELECT setting_value FROM guardian_exam_settings WHERE setting_key='delivery_fee_kes'`).get())?.setting_value ?? 300),
    })
    if (method === 'GET') return sendJson(response, 200, await loadPricing())
    if (!Array.isArray(payload.grades) || payload.grades.length !== 12) fail(400, 'GUARDIAN_PRICING_INVALID', 'Provide prices for all 12 grades.')
    const normalized = payload.grades.map((row) => ({ gradeCode: String(row?.gradeCode || ''), unitPriceKes: Number(row?.unitPriceKes) }))
    const expectedCodes = new Set(['PG','PP1','PP2',...Array.from({length:9},(_,index)=>`GRADE_${index+1}`)])
    if (normalized.some((row) => !expectedCodes.has(row.gradeCode) || !Number.isSafeInteger(row.unitPriceKes) || row.unitPriceKes < 0 || row.unitPriceKes > 100000) || new Set(normalized.map((row) => row.gradeCode)).size !== 12) fail(400, 'GUARDIAN_PRICING_INVALID', 'Each grade needs one whole-number price from KSh 0 to KSh 100,000.')
    const deliveryFeeKes = Number(payload.deliveryFeeKes)
    if (!Number.isSafeInteger(deliveryFeeKes) || deliveryFeeKes < 0 || deliveryFeeKes > 100000) fail(400, 'GUARDIAN_DELIVERY_FEE_INVALID', 'Delivery fee must be a whole-number amount from KSh 0 to KSh 100,000.')
    const savedAt = now()
    await db.transaction(async (tx) => {
      for (const row of normalized) await tx.query(`UPDATE guardian_exam_pricing SET unit_price_kes=$1,updated_by=$2,updated_at=$3 WHERE grade_code=$4`, [row.unitPriceKes, auth.user.id, savedAt, row.gradeCode])
      await tx.query(`UPDATE guardian_exam_settings SET setting_value=$1,updated_by=$2,updated_at=$3 WHERE setting_key='delivery_fee_kes'`, [deliveryFeeKes, auth.user.id, savedAt])
    })
    await audit('admin.guardian_exam_pricing_updated', null, auth.user.id, { grades: normalized, deliveryFeeKes })
    return sendJson(response, 200, { ...(await loadPricing()), updatedAt: savedAt, message: 'Guardian Exams prices saved. Existing orders retain their original price snapshot.' })
  }

  if (method === 'GET' && path === '/api/admin/guardian-exam-orders') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const orders = await prepare(`SELECT id,school_name AS "schoolName",contact_name AS "contactName",email,contact_phone AS "contactPhone",county,town,delivery_address AS "deliveryAddress",grades_snapshot AS grades,total_students AS "totalStudents",subtotal_kes AS "subtotalKes",delivery_fee_kes AS "deliveryFeeKes",total_kes AS "totalKes",status,payer_phone AS "payerPhone",payment_reference AS "paymentReference",payment_error AS "paymentError",created_at AS "createdAt",paid_at AS "paidAt" FROM guardian_exam_orders ORDER BY created_at DESC LIMIT 500`).all()
    return sendJson(response, 200, { orders })
  }

  const guardianOrderReviewMatch = path.match(/^\/api\/admin\/guardian-exam-orders\/([0-9a-f-]+)\/review$/i)
  if (method === 'POST' && guardianOrderReviewMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const decision = payload.decision === 'paid' ? 'paid' : payload.decision === 'failed' ? 'failed' : null
    const receipt = typeof payload.receipt === 'string' ? payload.receipt.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 32) : ''
    const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : ''
    if (!decision || note.length < 8) fail(400, 'GUARDIAN_ORDER_REVIEW_INVALID', 'Choose an outcome and add a reconciliation note of at least 8 characters.')
    if (decision === 'paid' && !/^[A-Za-z0-9]{6,32}$/.test(receipt)) fail(400, 'GUARDIAN_ORDER_RECEIPT_REQUIRED', 'Enter the verified M-PESA receipt before confirming payment.')
    const order = await db.transaction(async (tx) => {
      const current = await tx.one('SELECT id,status FROM guardian_exam_orders WHERE id=$1 FOR UPDATE', [guardianOrderReviewMatch[1]])
      if (!current || current.status !== 'payment_review') fail(409, 'GUARDIAN_ORDER_REVIEW_NOT_AVAILABLE', 'This school order is not waiting for payment review.')
      if (decision === 'paid') return tx.one(`UPDATE guardian_exam_orders SET status='paid',payment_reference=$1,payment_error=NULL,paid_at=$2,updated_at=$2 WHERE id=$3 RETURNING id,status,payment_reference AS "paymentReference"`, [`MPESA-${receipt}`, now(), current.id])
      return tx.one(`UPDATE guardian_exam_orders SET status='payment_failed',payment_error=$1,updated_at=$2 WHERE id=$3 RETURNING id,status,payment_reference AS "paymentReference"`, [note, now(), current.id])
    })
    await audit(`admin.guardian_exam.payment_review_${decision}`, null, auth.user.id, { orderId: order.id, receipt: decision === 'paid' ? receipt : null, note })
    return sendJson(response, 200, { order, message: decision === 'paid' ? 'Verified payment recorded.' : 'Order marked unpaid after reconciliation.' })
  }

  if (method === 'GET' && path === '/api/marketplace/payment-options') {
    const mpesa = darajaConfig()
    return sendJson(response, 200, { mpesa: { enabled: mpesa.ready, environment: mpesa.ready ? mpesa.environment : null } })
  }

  if (method === 'GET' && path === '/api/marketplace/series-subjects') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const curriculum = url.searchParams.get('curriculum')?.trim().slice(0, 80) || ''
    const grade = url.searchParams.get('grade')?.trim().slice(0, 80) || ''
    if (!curriculum || !grade) fail(400, 'SERIES_CHECKLIST_INPUT_REQUIRED', 'Choose a curriculum and grade to load its complete-series checklist.')
    const subjects = await requiredMarketplaceSeriesSubjects(curriculum, grade)
    return sendJson(response, 200, { subjects: subjects.map((subject) => subject.name), requiredSubjects: subjects.filter((subject) => subject.marketplaceRequired).map((subject) => subject.name), curriculumCode: marketplaceCurriculumCode(curriculum), grade, configured: subjects.length > 0 })
  }

  const mpesaCallbackMatch = path.match(/^\/api\/mpesa\/callback\/([^/]+)$/)
  if (method === 'POST' && mpesaCallbackMatch) {
    const config = darajaConfig()
    if (!config.callbackSecret || !safeEqualHex(hashToken(mpesaCallbackMatch[1]), hashToken(config.callbackSecret))) fail(404, 'CALLBACK_NOT_FOUND', 'Callback endpoint not found.')
    const callback = payload?.Body?.stkCallback
    const checkoutRequestId = typeof callback?.CheckoutRequestID === 'string' ? callback.CheckoutRequestID : ''
    const resultCode = String(callback?.ResultCode ?? '')
    if (!checkoutRequestId) return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Acknowledged' })
    const guardianOrder = await prepare(`SELECT id,total_kes,status,payer_phone,contact_phone,email FROM guardian_exam_orders WHERE checkout_request_id=?`).get(checkoutRequestId)
    if (guardianOrder) {
      if (guardianOrder.status === 'paid') return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Already processed' })
      if (resultCode !== '0') {
        await prepare(`UPDATE guardian_exam_orders SET status='payment_failed',mpesa_result_code=?,payment_error=?,updated_at=? WHERE id=? AND status='payment_pending'`)
          .run(resultCode.slice(0, 40), String(callback.ResultDesc || 'Payment was not completed.').slice(0, 300), now(), guardianOrder.id)
        return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Acknowledged' })
      }
      const metadata = Array.isArray(callback?.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : []
      const getMeta = (name) => metadata.find((item) => item?.Name === name)?.Value
      const amount = Number(getMeta('Amount'))
      const receipt = String(getMeta('MpesaReceiptNumber') || '').trim()
      const payerPhone = normalizeMpesaPhone(getMeta('PhoneNumber'))
      const expectedPhone = normalizeMpesaPhone(guardianOrder.payer_phone)
      if (!receipt || !Number.isFinite(amount) || Math.round(Number(guardianOrder.total_kes)) !== Math.round(amount) || !payerPhone || payerPhone !== expectedPhone) {
        await prepare(`UPDATE guardian_exam_orders SET status='payment_review',mpesa_result_code='CALLBACK_MISMATCH',payment_error='Payment confirmation needs administrator review.',updated_at=? WHERE id=? AND status='payment_pending'`).run(now(), guardianOrder.id)
        await audit('guardian_exam.payment_review_required', null, null, { orderId: guardianOrder.id, receiptPresent: Boolean(receipt), amountMatched: Number.isFinite(amount) && Math.round(Number(guardianOrder.total_kes)) === Math.round(amount), phoneMatched: Boolean(payerPhone && payerPhone === expectedPhone) })
        return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Acknowledged for review' })
      }
      const paymentReference = `MPESA-${receipt}`
      const paidOrder = await prepare(`UPDATE guardian_exam_orders SET status='paid',payment_reference=?,payment_error=NULL,mpesa_result_code='0',paid_at=?,updated_at=? WHERE id=? AND status='payment_pending' RETURNING id`)
        .get(paymentReference, now(), now(), guardianOrder.id)
      if (!paidOrder) return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Already processed' })
      await audit('guardian_exam.order_paid', null, null, { orderId: guardianOrder.id, paymentReference, amountKes: amount })
      if (guardianOrder.email && otpDelivery === 'resend') {
        try { await sendGuardianOrderReceipt({ to: guardianOrder.email, orderId: guardianOrder.id, receipt, amountKes: amount }) }
        catch (error) { console.error('Guardian exam order receipt email could not be delivered:', error instanceof Error ? error.message : 'unknown email error') }
      }
      if (guardianOrder.contact_phone && mobileSasaReady()) {
        try { await sendGuardianPaymentReceiptSms({ to: guardianOrder.contact_phone, orderId: guardianOrder.id, receipt, amountKes: amount }) }
        catch (error) { console.error('Guardian exam order receipt SMS could not be delivered:', error instanceof Error ? error.message : 'unknown SMS error') }
      }
      return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Accepted' })
    }
    const order = await prepare(`SELECT id,buyer_user_id,total_kes,status,payer_phone FROM marketplace_orders WHERE checkout_request_id=?`).get(checkoutRequestId)
    if (!order) return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Acknowledged' })
    if (order.status === 'paid') return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Already processed' })
    if (resultCode !== '0') {
      await prepare(`UPDATE marketplace_orders SET status='payment_failed',mpesa_result_code=?,payment_error=?,updated_at=? WHERE id=? AND status='payment_pending'`)
        .run(resultCode.slice(0, 40), String(callback.ResultDesc || 'Payment was not completed.').slice(0, 300), now(), order.id)
      await audit('marketplace.mpesa_payment_failed', order.buyer_user_id, null, { orderId: order.id, resultCode })
      return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Acknowledged' })
    }
    const metadata = Array.isArray(callback?.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : []
    const getMeta = (name) => metadata.find((item) => item?.Name === name)?.Value
    const amount = Number(getMeta('Amount'))
    const receipt = String(getMeta('MpesaReceiptNumber') || '').trim()
    const payerPhone = normalizeMpesaPhone(getMeta('PhoneNumber'))
    const expectedPhone = normalizeMpesaPhone(order.payer_phone)
    if (!receipt || !Number.isFinite(amount) || Math.round(Number(order.total_kes)) !== Math.round(amount) || !payerPhone || payerPhone !== expectedPhone) {
      await prepare(`UPDATE marketplace_orders SET status='payment_review',mpesa_result_code='CALLBACK_MISMATCH',payment_error='Payment confirmation needs administrator review.',updated_at=? WHERE id=? AND status='payment_pending'`).run(now(), order.id)
      await audit('marketplace.mpesa_callback_review_required', order.buyer_user_id, null, { orderId: order.id, receiptPresent: Boolean(receipt), amountMatched: Number.isFinite(amount) && Math.round(Number(order.total_kes)) === Math.round(amount), phoneMatched: Boolean(payerPhone && payerPhone === expectedPhone) })
      return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Acknowledged for review' })
    }
    let paymentProcessed = false
    await db.transaction(async (tx) => {
      const current = await tx.one('SELECT id,status FROM marketplace_orders WHERE id=$1 FOR UPDATE', [order.id])
      if (current?.status !== 'payment_pending') return
      await settlePaidMarketplaceOrder(tx, { ...order, id: current.id }, null, receipt, now(), 'mpesa_daraja')
      paymentProcessed = true
    })
    if (!paymentProcessed) return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Already processed' })
    const buyer = await prepare('SELECT email FROM users WHERE id=?').get(order.buyer_user_id)
    if (buyer?.email && otpDelivery === 'resend') {
      try { await sendGuardianOrderReceipt({ to: buyer.email, orderId: order.id, receipt, amountKes: amount }) }
      catch (error) { console.error('Guardian payment email could not be delivered:', error instanceof Error ? error.message : 'unknown email error') }
    }
    if (order.payer_phone && mobileSasaReady()) {
      try { await sendGuardianPaymentReceiptSms({ to: order.payer_phone, orderId: order.id, receipt, amountKes: amount }) }
      catch (error) { console.error('Guardian payment SMS could not be delivered:', error instanceof Error ? error.message : 'unknown SMS error') }
    }
    return sendJson(response, 200, { ResultCode: 0, ResultDesc: 'Accepted' })
  }

  if (method === 'GET' && path === '/api/admin/integrations') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const mpesa = darajaConfig()
    return sendJson(response, 200, { integrations: {
      email: { provider: otpDelivery === 'resend' ? 'Resend' : 'Console', ready: otpDelivery === 'resend' && resendReady() },
      sms: { provider: 'MobileSasa', ready: mobileSasaReady() },
      mpesa: { provider: 'Safaricom Daraja', ready: mpesa.ready, environment: mpesa.ready ? mpesa.environment : 'not configured', callbackReady: Boolean(mpesa.callbackUrl.startsWith('https://') && mpesa.callbackSecret.length >= 32) },
    } })
  }

  if (method === 'GET' && path === '/api/admin/marketplace-payment-reviews') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const orders = await prepare(`SELECT o.id,o.total_kes AS "totalKes",o.payer_phone AS "payerPhone",o.payment_error AS "paymentError",
      o.created_at AS "createdAt",o.checkout_request_id AS "checkoutRequestId",u.full_name AS "buyerName",u.email AS "buyerEmail"
      FROM marketplace_orders o JOIN users u ON u.id=o.buyer_user_id WHERE o.status='payment_review' ORDER BY o.updated_at ASC LIMIT 100`).all()
    return sendJson(response, 200, { orders })
  }

  const paymentReviewMatch = path.match(/^\/api\/admin\/marketplace-payment-reviews\/([0-9a-f-]+)$/i)
  if (method === 'POST' && paymentReviewMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const decision = payload.decision === 'paid' ? 'paid' : payload.decision === 'failed' ? 'failed' : null
    const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : ''
    const receipt = typeof payload.receipt === 'string' ? payload.receipt.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 32) : ''
    if (!decision || note.length < 8) fail(400, 'PAYMENT_REVIEW_REQUIRED', 'Choose an outcome and enter a reconciliation note of at least 8 characters.')
    if (decision === 'paid' && !/^[A-Za-z0-9]{6,32}$/.test(receipt)) fail(400, 'PAYMENT_RECEIPT_REQUIRED', 'Enter the verified M-PESA receipt reference before confirming payment.')
    const reviewResult = await db.transaction(async (tx) => {
      const order = await tx.one('SELECT * FROM marketplace_orders WHERE id=$1 FOR UPDATE', [paymentReviewMatch[1]])
      if (!order || order.status !== 'payment_review' || order.payment_method !== 'mpesa_daraja') fail(409, 'PAYMENT_REVIEW_NOT_AVAILABLE', 'This payment is no longer waiting for review.')
      if (decision === 'failed') {
        await tx.query(`UPDATE marketplace_orders SET status='payment_failed',mpesa_result_code='ADMIN_REJECTED',payment_error=$1,updated_at=$2 WHERE id=$3`, [note, now(), order.id])
        await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'marketplace.mpesa_review_rejected',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ orderId: order.id, note }), now()])
        return { id: order.id, status: 'payment_failed', paymentReference: null }
      }
      await settlePaidMarketplaceOrder(tx, order, auth.user.id, receipt, now(), 'mpesa_daraja')
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'marketplace.mpesa_review_confirmed',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ orderId: order.id, receipt, note }), now()])
      return { id: order.id, status: 'paid', paymentReference: receipt }
    })
    return sendJson(response, 200, { order: reviewResult, message: decision === 'paid' ? 'Verified payment recorded and seller earnings queued for settlement.' : 'Payment marked unsuccessful after review. The buyer may retry checkout.' })
  }

  if (method === 'GET' && path === '/api/teacher/assessments') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const assessments = await prepare(`SELECT a.id,a.join_code AS "joinCode",a.title,a.instructions,a.assessment_mode AS mode,a.duration_minutes AS "durationMinutes",
      a.status,a.created_at AS "createdAt",a.published_at AS "publishedAt",COUNT(DISTINCT q.id)::int AS "questionCount",
      COUNT(DISTINCT t.id)::int AS "attemptCount" FROM assessments a LEFT JOIN assessment_questions q ON q.assessment_id=a.id
      LEFT JOIN assessment_attempts t ON t.assessment_id=a.id WHERE a.teacher_user_id=? AND a.institution_id=?
      GROUP BY a.id ORDER BY a.updated_at DESC LIMIT 100`).all(auth.user.id, auth.context.institutionId)
    return sendJson(response, 200, { assessments })
  }

  if (method === 'POST' && path === '/api/teacher/assessments') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    if (!auth.context.institutionId) fail(403, 'INSTITUTION_REQUIRED', 'Select a school role before creating an assessment.')
    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    const instructions = typeof payload.instructions === 'string' ? payload.instructions.trim().slice(0, 4000) : ''
    const mode = ['practice', 'exam'].includes(payload.mode) ? payload.mode : 'practice'
    const durationMinutes = Number(payload.durationMinutes ?? 30)
    const questions = Array.isArray(payload.questions) ? payload.questions : []
    if (title.length < 4 || title.length > 180) fail(400, 'ASSESSMENT_TITLE_INVALID', 'Enter an assessment title between 4 and 180 characters.')
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) fail(400, 'ASSESSMENT_DURATION_INVALID', 'Choose a duration from 1 to 360 minutes.')
    if (questions.length < 1 || questions.length > 250) fail(400, 'ASSESSMENT_QUESTIONS_INVALID', 'Add between 1 and 250 questions.')
    const fields = questions.map((question, index) => assessmentQuestionFields(question, index + 1))
    const assessmentId = randomUUID()
    const joinCode = randomBytes(5).toString('hex').toUpperCase()
    const timestamp = now()
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO assessments(id,teacher_user_id,institution_id,join_code,title,instructions,assessment_mode,duration_minutes,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`, [assessmentId, auth.user.id, auth.context.institutionId, joinCode, title, instructions, mode, durationMinutes, timestamp])
      for (const question of fields) await tx.query(`INSERT INTO assessment_questions(assessment_id,position,prompt,question_type,options,correct_answer,marking_guide,explanation,marks)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`, [assessmentId, question.position, question.prompt, question.type, JSON.stringify(question.options), question.correctAnswer, question.markingGuide, question.explanation, question.marks])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'teacher.assessment_created',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ assessmentId, institutionId: auth.context.institutionId, questionCount: fields.length }), timestamp])
    })
    return sendJson(response, 201, { assessment: { id: assessmentId, joinCode, title, instructions, mode, durationMinutes, questionCount: fields.length, status: 'draft', createdAt: timestamp } })
  }

  const publishAssessmentMatch = path.match(/^\/api\/teacher\/assessments\/([0-9a-f-]+)\/publish$/i)
  if (method === 'POST' && publishAssessmentMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const assessment = await prepare(`UPDATE assessments SET status='published',published_at=COALESCE(published_at,?),closed_at=NULL,updated_at=?
      WHERE id=? AND teacher_user_id=? AND institution_id=? AND status IN ('draft','closed')
      RETURNING id,join_code AS "joinCode",title,status,published_at AS "publishedAt"`).get(now(), now(), publishAssessmentMatch[1], auth.user.id, auth.context.institutionId)
    if (!assessment) fail(404, 'EDITABLE_ASSESSMENT_NOT_FOUND', 'That assessment was not found or cannot be published.')
    await audit('teacher.assessment_published', auth.user.id, auth.user.id, { assessmentId: assessment.id })
    return sendJson(response, 200, { assessment, message: 'Assessment published. Learners with its join code can now start an attempt.' })
  }

  const closeAssessmentMatch = path.match(/^\/api\/teacher\/assessments\/([0-9a-f-]+)\/close$/i)
  if (method === 'POST' && closeAssessmentMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const assessment = await prepare(`UPDATE assessments SET status='closed',closed_at=?,updated_at=? WHERE id=? AND teacher_user_id=? AND institution_id=? AND status='published'
      RETURNING id,join_code AS "joinCode",status,closed_at AS "closedAt"`).get(now(), now(), closeAssessmentMatch[1], auth.user.id, auth.context.institutionId)
    if (!assessment) fail(404, 'PUBLISHED_ASSESSMENT_NOT_FOUND', 'That published assessment was not found.')
    await audit('teacher.assessment_closed', auth.user.id, auth.user.id, { assessmentId: assessment.id })
    return sendJson(response, 200, { assessment })
  }

  if (method === 'GET' && path === '/api/teacher/marking-queue') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const attempts = await prepare(`SELECT t.id,t.assessment_id AS "assessmentId",a.title AS "assessmentTitle",a.join_code AS "joinCode",
      u.id AS "learnerId",u.full_name AS "learnerName",t.status,t.auto_score AS "autoScore",t.maximum_score AS "maximumScore",
      t.started_at AS "startedAt",t.submitted_at AS "submittedAt",(COUNT(q.id) FILTER (WHERE q.question_type='essay'))::int AS "manualQuestionCount",
      COUNT(m.id)::int AS "markedQuestionCount" FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id
      JOIN users u ON u.id=t.learner_user_id JOIN assessment_questions q ON q.assessment_id=a.id
      LEFT JOIN assessment_question_marks m ON m.attempt_id=t.id AND m.question_id=q.id
      WHERE a.teacher_user_id=? AND a.institution_id=? AND t.status IN ('submitted','marking')
      GROUP BY t.id,a.id,u.id ORDER BY t.submitted_at ASC LIMIT 250`).all(auth.user.id, auth.context.institutionId)
    return sendJson(response, 200, { attempts })
  }

  const teacherAttemptMatch = path.match(/^\/api\/teacher\/attempts\/([0-9a-f-]+)$/i)
  if (method === 'GET' && teacherAttemptMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const attempt = await prepare(`SELECT t.id,t.assessment_id AS "assessmentId",a.title AS "assessmentTitle",u.full_name AS "learnerName",t.status,
      t.answers,t.auto_score AS "autoScore",t.maximum_score AS "maximumScore",t.submitted_at AS "submittedAt"
      FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id JOIN users u ON u.id=t.learner_user_id
      WHERE t.id=? AND a.teacher_user_id=? AND a.institution_id=? AND t.status IN ('submitted','marking','published')`).get(teacherAttemptMatch[1], auth.user.id, auth.context.institutionId)
    if (!attempt) fail(404, 'MARKING_ATTEMPT_NOT_FOUND', 'That learner submission was not found in your marking queue.')
    attempt.questions = await prepare(`SELECT q.id,q.position,q.prompt,q.question_type AS type,q.options,q.correct_answer AS "correctAnswer",
      q.marking_guide AS "markingGuide",q.explanation,q.marks,m.awarded_marks AS "awardedMarks",m.feedback
      FROM assessment_questions q LEFT JOIN assessment_question_marks m ON m.question_id=q.id AND m.attempt_id=?
      WHERE q.assessment_id=? ORDER BY q.position`).all(attempt.id, attempt.assessmentId)
    return sendJson(response, 200, { attempt })
  }

  const markAttemptMatch = path.match(/^\/api\/teacher\/attempts\/([0-9a-f-]+)\/marks$/i)
  if (method === 'PUT' && markAttemptMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const questionId = typeof payload.questionId === 'string' ? payload.questionId : ''
    const awardedMarks = Number(payload.awardedMarks)
    const feedback = typeof payload.feedback === 'string' ? payload.feedback.trim().slice(0, 3000) : ''
    const ownership = await prepare(`SELECT q.id,q.marks FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id
      JOIN assessment_questions q ON q.assessment_id=a.id WHERE t.id=? AND q.id=? AND q.question_type='essay' AND a.teacher_user_id=? AND a.institution_id=? AND t.status IN ('submitted','marking')`).get(markAttemptMatch[1], questionId, auth.user.id, auth.context.institutionId)
    if (!ownership) fail(404, 'MARKABLE_QUESTION_NOT_FOUND', 'That written response is not available for manual marking.')
    if (!Number.isFinite(awardedMarks) || awardedMarks < 0 || awardedMarks > Number(ownership.marks)) fail(400, 'AWARDED_MARKS_INVALID', `Award between 0 and ${ownership.marks} marks.`)
    const stamp = now()
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO assessment_question_marks(attempt_id,question_id,awarded_marks,feedback,marked_by,updated_at)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(attempt_id,question_id) DO UPDATE SET awarded_marks=EXCLUDED.awarded_marks,
        feedback=EXCLUDED.feedback,marked_by=EXCLUDED.marked_by,updated_at=EXCLUDED.updated_at`, [markAttemptMatch[1], questionId, awardedMarks, feedback, auth.user.id, stamp])
      await tx.query(`UPDATE assessment_attempts SET status='marking' WHERE id=$1 AND status='submitted'`, [markAttemptMatch[1]])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'teacher.assessment_response_marked',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ attemptId: markAttemptMatch[1], questionId, awardedMarks }), stamp])
    })
    return sendJson(response, 200, { questionMark: { questionId, awardedMarks, feedback, updatedAt: stamp } })
  }

  const publishAttemptMatch = path.match(/^\/api\/teacher\/attempts\/([0-9a-f-]+)\/publish$/i)
  if (method === 'POST' && publishAttemptMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const publishedAt = now()
    const result = await db.transaction(async (tx) => {
      const attempt = await tx.one(`SELECT t.id,t.learner_user_id,a.id AS assessment_id FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id
        WHERE t.id=$1 AND a.teacher_user_id=$2 AND a.institution_id=$3 AND t.status IN ('submitted','marking') FOR UPDATE OF t`, [publishAttemptMatch[1], auth.user.id, auth.context.institutionId])
      if (!attempt) fail(404, 'PENDING_ASSESSMENT_ATTEMPT_NOT_FOUND', 'That assessment attempt is not awaiting publication.')
      const incomplete = await tx.one(`SELECT COUNT(*)::int AS count FROM assessment_questions q LEFT JOIN assessment_question_marks m ON m.question_id=q.id AND m.attempt_id=$1
        WHERE q.assessment_id=$2 AND q.question_type='essay' AND m.id IS NULL`, [attempt.id, attempt.assessment_id])
      if (incomplete.count) fail(409, 'MANUAL_MARKING_INCOMPLETE', 'Mark every written response before publishing this result.', { unmarkedResponses: incomplete.count })
      const marks = await tx.one(`SELECT t.auto_score+COALESCE(SUM(m.awarded_marks),0) AS score,t.maximum_score AS maximum_score
        FROM assessment_attempts t LEFT JOIN assessment_question_marks m ON m.attempt_id=t.id WHERE t.id=$1 GROUP BY t.id`, [attempt.id])
      await tx.query(`UPDATE assessment_attempts SET status='published',published_at=$1 WHERE id=$2`, [publishedAt, attempt.id])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES($1,$2,'teacher.assessment_result_published',$3,$4::jsonb,$5)`, [randomUUID(), auth.user.id, attempt.learner_user_id, JSON.stringify({ attemptId: attempt.id, assessmentId: attempt.assessment_id, score: marks.score, maximumScore: marks.maximum_score }), publishedAt])
      return { attemptId: attempt.id, learnerUserId: attempt.learner_user_id, score: Number(marks.score), maximumScore: Number(marks.maximum_score), publishedAt }
    })
    return sendJson(response, 200, { result, message: 'Assessment result published to the learner account.' })
  }

  if (method === 'GET' && path === '/api/learner/results') {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    const results = await prepare(`SELECT t.id AS "attemptId",a.id AS "assessmentId",a.title,a.assessment_mode AS mode,t.auto_score AS "autoScore",
      COALESCE(SUM(m.awarded_marks),0) AS "teacherScore",t.maximum_score AS "maximumScore",
      t.auto_score+COALESCE(SUM(m.awarded_marks),0) AS score,
      ROUND((t.auto_score+COALESCE(SUM(m.awarded_marks),0))*100/t.maximum_score,1) AS percentage,t.published_at AS "publishedAt"
      FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id LEFT JOIN assessment_question_marks m ON m.attempt_id=t.id
      WHERE t.learner_user_id=? AND t.status='published' GROUP BY t.id,a.id ORDER BY t.published_at DESC LIMIT 100`).all(auth.user.id)
    return sendJson(response, 200, { results })
  }

  const childResultsMatch = path.match(/^\/api\/parent\/learners\/([0-9a-f-]+)\/results$/i)
  if (method === 'GET' && childResultsMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Parent'])
    const learnerUserId = childResultsMatch[1]
    if (!await prepare(`SELECT 1 AS found FROM parent_learner_links WHERE parent_user_id=? AND learner_user_id=? AND status='approved'`).get(auth.user.id, learnerUserId)) fail(403, 'LEARNER_LINK_REQUIRED', 'You can only view results for an approved linked learner.')
    const results = await prepare(`SELECT t.id AS "attemptId",a.id AS "assessmentId",a.title,a.assessment_mode AS mode,t.auto_score AS "autoScore",
      COALESCE(SUM(m.awarded_marks),0) AS "teacherScore",t.maximum_score AS "maximumScore",t.auto_score+COALESCE(SUM(m.awarded_marks),0) AS score,
      ROUND((t.auto_score+COALESCE(SUM(m.awarded_marks),0))*100/t.maximum_score,1) AS percentage,t.published_at AS "publishedAt"
      FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id LEFT JOIN assessment_question_marks m ON m.attempt_id=t.id
      WHERE t.learner_user_id=? AND t.status='published' GROUP BY t.id,a.id ORDER BY t.published_at DESC LIMIT 100`).all(learnerUserId)
    return sendJson(response, 200, { results })
  }

  if (method === 'GET' && path === '/api/learner/assessments') {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    const assessments = await prepare(`SELECT a.join_code AS "joinCode",a.title,a.instructions,a.assessment_mode AS mode,a.duration_minutes AS "durationMinutes",
      a.published_at AS "publishedAt",t.status AS "attemptStatus",t.id AS "attemptId",t.submitted_at AS "submittedAt"
      FROM assessments a LEFT JOIN assessment_attempts t ON t.assessment_id=a.id AND t.learner_user_id=?
      WHERE a.status='published' AND (t.id IS NULL OR t.status IN ('in_progress','published')) ORDER BY a.published_at DESC LIMIT 100`).all(auth.user.id)
    return sendJson(response, 200, { assessments })
  }

  if (method === 'GET' && path === '/api/learner/assessments/lookup') {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    const code = (url.searchParams.get('code') || '').trim().toUpperCase()
    if (!/^[A-F0-9]{10}$/.test(code)) fail(400, 'ASSESSMENT_CODE_INVALID', 'Enter the 10-character assessment join code.')
    const assessment = await prepare(`SELECT id,join_code AS "joinCode",title,instructions,assessment_mode AS mode,duration_minutes AS "durationMinutes",published_at AS "publishedAt"
      FROM assessments WHERE join_code=? AND status='published'`).get(code)
    if (!assessment) fail(404, 'PUBLISHED_ASSESSMENT_NOT_FOUND', 'No open assessment matches this join code.')
    return sendJson(response, 200, { assessment })
  }

  const startAttemptMatch = path.match(/^\/api\/learner\/assessments\/([A-F0-9]{10})\/attempts$/i)
  if (method === 'POST' && startAttemptMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    rateLimit(request, 'assessment-attempt-start', 10, 60_000, auth.user.id)
    const code = startAttemptMatch[1].toUpperCase()
    const attempt = await db.transaction(async (tx) => {
      const assessment = await tx.one(`SELECT * FROM assessments WHERE join_code=$1 AND status='published' FOR SHARE`, [code])
      if (!assessment) fail(404, 'PUBLISHED_ASSESSMENT_NOT_FOUND', 'No open assessment matches this join code.')
      const existing = await tx.one(`SELECT id,status,started_at AS "startedAt",submitted_at AS "submittedAt" FROM assessment_attempts WHERE assessment_id=$1 AND learner_user_id=$2`, [assessment.id, auth.user.id])
      if (existing && existing.status !== 'in_progress') fail(409, 'ATTEMPT_ALREADY_SUBMITTED', 'You have already submitted this assessment.')
      const questions = await tx.many(`SELECT id,position,prompt,question_type AS type,options,marks FROM assessment_questions WHERE assessment_id=$1 ORDER BY position`, [assessment.id])
      if (!questions.length) fail(409, 'ASSESSMENT_EMPTY', 'This assessment has no questions yet.')
      const maximumScore = questions.reduce((sum, question) => sum + Number(question.marks), 0)
      const saved = existing || await tx.one(`INSERT INTO assessment_attempts(assessment_id,learner_user_id,maximum_score) VALUES($1,$2,$3)
        RETURNING id,status,started_at AS "startedAt",submitted_at AS "submittedAt"`, [assessment.id, auth.user.id, maximumScore])
      return { assessment: { id: assessment.id, joinCode: code, title: assessment.title, instructions: assessment.instructions, mode: assessment.assessment_mode, durationMinutes: assessment.duration_minutes }, attempt: saved, questions }
    })
    return sendJson(response, 200, attempt)
  }

  const attemptAnswersMatch = path.match(/^\/api\/learner\/attempts\/([0-9a-f-]+)\/answers$/i)
  if (method === 'PUT' && attemptAnswersMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    if (!payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers) || Object.keys(payload.answers).length > 250) fail(400, 'ANSWERS_INVALID', 'Submit an answer object with up to 250 question IDs.')
    const attempt = await prepare(`SELECT t.id,t.assessment_id AS "assessmentId",a.duration_minutes AS "durationMinutes",t.started_at AS "startedAt"
      FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=? AND t.learner_user_id=? AND t.status='in_progress'`).get(attemptAnswersMatch[1], auth.user.id)
    if (!attempt) fail(404, 'ACTIVE_ATTEMPT_NOT_FOUND', 'That active assessment attempt was not found.')
    if (Date.now() > new Date(attempt.startedAt).getTime() + Number(attempt.durationMinutes) * 60_000 + 60_000) fail(409, 'ASSESSMENT_TIME_EXPIRED', 'The assessment time has expired. Submit your saved answers now.')
    const questionIds = (await prepare(`SELECT id FROM assessment_questions WHERE assessment_id=?`).all(attempt.assessmentId)).map((item) => item.id)
    if (Object.keys(payload.answers).some((id) => !questionIds.includes(id))) fail(400, 'ANSWER_QUESTION_INVALID', 'One or more answers reference a question outside this assessment.')
    const answers = Object.fromEntries(Object.entries(payload.answers).map(([id, value]) => [id, typeof value === 'string' ? value.slice(0, 12000) : value]))
    await prepare(`UPDATE assessment_attempts SET answers=?::jsonb WHERE id=? AND learner_user_id=?`).run(JSON.stringify(answers), attempt.id, auth.user.id)
    return sendJson(response, 200, { savedAt: now(), answerCount: Object.keys(answers).length })
  }

  const submitAttemptMatch = path.match(/^\/api\/learner\/attempts\/([0-9a-f-]+)\/submit$/i)
  if (method === 'POST' && submitAttemptMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    const submittedAt = now()
    const result = await db.transaction(async (tx) => {
      const attempt = await tx.one(`SELECT * FROM assessment_attempts WHERE id=$1 AND learner_user_id=$2 FOR UPDATE`, [submitAttemptMatch[1], auth.user.id])
      if (!attempt || attempt.status !== 'in_progress') fail(409, 'ACTIVE_ATTEMPT_NOT_FOUND', 'This assessment is not awaiting submission.')
      const questions = await tx.many(`SELECT id,question_type,correct_answer,marks FROM assessment_questions WHERE assessment_id=$1 ORDER BY position`, [attempt.assessment_id])
      const answers = typeof attempt.answers === 'string' ? JSON.parse(attempt.answers) : attempt.answers
      let autoScore = 0
      let manualCount = 0
      for (const question of questions) {
        if (question.question_type === 'essay') { manualCount += 1; continue }
        const expected = typeof question.correct_answer === 'string' ? JSON.parse(question.correct_answer) : question.correct_answer
        if (answerIsCorrect(question.question_type, answers[question.id], expected)) autoScore += Number(question.marks)
      }
      await tx.query(`UPDATE assessment_attempts SET status='submitted',auto_score=$1,submitted_at=$2 WHERE id=$3`, [autoScore, submittedAt, attempt.id])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES($1,$2,'learner.assessment_submitted',$3,$4::jsonb,$5)`, [randomUUID(), auth.user.id, auth.user.id, JSON.stringify({ attemptId: attempt.id, assessmentId: attempt.assessment_id, autoScore, manualQuestionCount: manualCount }), submittedAt])
      return { attemptId: attempt.id, status: 'submitted', autoScore, maximumScore: Number(attempt.maximum_score), manualQuestionCount: manualCount, submittedAt }
    })
    return sendJson(response, 200, { result, message: 'Answers submitted. Results will be available after teacher review and publication.' })
  }

  const learnerAttemptMatch = path.match(/^\/api\/learner\/attempts\/([0-9a-f-]+)$/i)
  if (method === 'GET' && learnerAttemptMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner'])
    const attempt = await prepare(`SELECT t.id,t.status,t.answers,t.auto_score AS "autoScore",t.maximum_score AS "maximumScore",t.started_at AS "startedAt",
      t.submitted_at AS "submittedAt",t.published_at AS "publishedAt",a.title,a.instructions,a.assessment_mode AS mode,a.duration_minutes AS "durationMinutes"
      FROM assessment_attempts t JOIN assessments a ON a.id=t.assessment_id WHERE t.id=? AND t.learner_user_id=?`).get(learnerAttemptMatch[1], auth.user.id)
    if (!attempt) fail(404, 'ASSESSMENT_ATTEMPT_NOT_FOUND', 'That assessment attempt was not found.')
    const isPublished = attempt.status === 'published'
    attempt.questions = await prepare(`SELECT q.id,q.position,q.prompt,q.question_type AS type,q.options,q.marks,q.explanation,
      CASE WHEN ? THEN q.correct_answer ELSE NULL END AS "correctAnswer",m.awarded_marks AS "awardedMarks",m.feedback
      FROM assessment_questions q JOIN assessment_attempts t ON t.assessment_id=q.assessment_id
      LEFT JOIN assessment_question_marks m ON m.question_id=q.id AND m.attempt_id=t.id
      WHERE t.id=? ORDER BY q.position`).all(isPublished, attempt.id)
    if (attempt.status !== 'in_progress') attempt.answers = null
    if (!isPublished) attempt.autoScore = null
    return sendJson(response, 200, { attempt })
  }

  if (method === 'POST' && path === '/api/auth/register') {
    rateLimit(request, 'register', 5)
    const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim().replace(/\s+/g, ' ') : ''
    const email = normalizeEmail(payload.email)
    const phone = normalizePhone(payload.phone)
    rateLimit(request, 'register-contact', 5, 60_000, email || phone || '')
    const role = payload.role || 'Learner'
    const channel = payload.channel === 'sms' ? 'sms' : 'email'
    if (channel === 'sms' && !mobileSasaReady()) fail(503, 'OTP_CHANNEL_UNAVAILABLE', 'SMS verification is not configured yet. Choose email verification or contact the administrator.')
    const invitationToken = typeof payload.invitationToken === 'string' ? payload.invitationToken : null
    if (fullName.length < 2 || fullName.length > 120) fail(400, 'NAME_INVALID', 'Enter a name between 2 and 120 characters.')
    if ((!email || !emailPattern.test(email)) && (!phone || !phonePattern.test(phone))) fail(400, 'CONTACT_INVALID', 'Enter a valid email address or Kenyan mobile number.')
    if (email && !emailPattern.test(email)) fail(400, 'EMAIL_INVALID', 'Enter a valid email address.')
    if (phone && !phonePattern.test(phone)) fail(400, 'PHONE_INVALID', 'Use an international phone number, for example +254712345678.')
    if (!validPassword(payload.password)) fail(400, 'PASSWORD_WEAK', `Use a password between ${passwordMinLength} and 128 characters.`)
    if (!roles.includes(role)) fail(400, 'ROLE_INVALID', 'Choose a supported account role.')
    let invitation = null
    if (invitationToken) invitation = await prepare(`SELECT * FROM role_invitations WHERE token_hash=? AND accepted_at IS NULL AND expires_at>?`).get(hashToken(invitationToken), now())
    if (invitationToken && !invitation) fail(400, 'INVITATION_INVALID', 'This role invitation is expired, already used, or invalid.')
    if (!publicRoles.has(role) && (!invitation || invitation.role !== role)) fail(403, 'INVITATION_REQUIRED', 'Educator, school, examiner and platform roles must be assigned by an administrator invitation.')
    if (invitation) {
      const destination = invitation.destination.includes('@') ? email : phone
      if (destination !== invitation.destination || role !== invitation.role) fail(400, 'INVITATION_MISMATCH', 'This invitation belongs to a different contact or role.')
    }
    if (channel === 'email' && !email) fail(400, 'CONTACT_REQUIRED', 'An email address is required for email verification.')
    if (channel === 'sms' && !phone) fail(400, 'CONTACT_REQUIRED', 'A mobile number is required for SMS verification.')
    if ((email && await q.userByEmail.get(email)) || (phone && await q.userByPhone.get(phone))) fail(409, 'ACCOUNT_EXISTS', 'An account already uses that email or phone number. Sign in or reset the password.')
    const id = randomUUID()
    const stamp = now()
    const passwordHash = await hashPassword(payload.password)
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO users(id,full_name,email,email_normalized,phone,phone_normalized,password_hash,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`, [id, fullName, email, email, phone, phone, passwordHash, stamp, stamp])
      await tx.query('INSERT INTO user_roles(id,user_id,role,institution_id,granted_by,created_at) VALUES($1,$2,$3,NULL,NULL,$4)', [randomUUID(), id, role, stamp])
    })
    const user = await q.userById.get(id)
    const challenge = await issueChallenge({ user, purpose: 'registration', channel, invitationId: invitation?.id || null })
    await audit('auth.registration_started', id, id, { role, channel })
    return sendJson(response, 201, { message: 'Enter the verification code sent to your contact.', ...challenge, expiresInSeconds: 600 })
  }

  if (method === 'POST' && path === '/api/auth/verify') {
    rateLimit(request, 'verify', 12)
    const challenge = await otpChallenge(payload.challengeId, 'registration')
    const code = typeof payload.code === 'string' ? payload.code : ''
    if (!/^\d{6}$/.test(code) || !safeEqualHex(challenge.code_hash, hashOtp(challenge.id, code))) {
      await prepare('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?').run(challenge.id)
      fail(400, 'CODE_INVALID', 'That verification code is incorrect. Check the code and try again.')
    }
    const stamp = now()
    const invitationRole = await db.transaction(async (tx) => {
      await tx.query('UPDATE auth_challenges SET consumed_at=$1 WHERE id=$2 AND consumed_at IS NULL', [stamp, challenge.id])
      await tx.query(`UPDATE users SET status='active',${challenge.channel === 'email' ? 'email_verified_at' : 'phone_verified_at'}=$1,updated_at=$2 WHERE id=$3`, [stamp, stamp, challenge.user_id])
      let grantedRole = null
      if (challenge.invitation_id) {
        const invitation = await tx.one('SELECT * FROM role_invitations WHERE id=$1 AND accepted_at IS NULL AND expires_at>$2 FOR UPDATE', [challenge.invitation_id, stamp])
        if (!invitation) fail(400, 'INVITATION_EXPIRED', 'The role invitation expired before verification. Ask your administrator for a new invitation.')
        await tx.query('INSERT INTO user_roles(id,user_id,role,institution_id,granted_by,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [randomUUID(), challenge.user_id, invitation.role, invitation.institution_id, invitation.invited_by, stamp])
        await tx.query('UPDATE role_invitations SET accepted_by=$1,accepted_at=$2 WHERE id=$3', [challenge.user_id, stamp, invitation.id])
        grantedRole = invitation.role
      }
      return grantedRole
    })
    const user = await q.userById.get(challenge.user_id)
    if (challenge.channel === 'email' && otpDelivery === 'resend' && user.email) {
      try { await sendGuardianWelcome({ to: user.email, name: user.full_name, userId: user.id }) }
      catch (error) { console.error('Guardian welcome email could not be delivered:', error instanceof Error ? error.message : 'unknown email error') }
    }
    const userRoles = await q.roles.all(user.id)
    const preferred = userRoles.find((item) => item.role === invitationRole) || userRoles.find((item) => item.role === 'Learner') || userRoles.find((item) => item.role === 'Parent') || userRoles[0]
    const session = await createSession(user.id, preferred.role, preferred.institutionId)
    await audit('auth.registration_verified', user.id, user.id, { channel: challenge.channel })
    return sendJson(response, 200, { user: await safeUser(user, userRoles), activeRole: preferred.role, expiresAt: session.expiresAt }, { 'Set-Cookie': cookieHeader(session.token, sessionDays * 86_400) })
  }

  if (method === 'POST' && path === '/api/auth/resend') {
    rateLimit(request, 'resend', 5)
    const previous = await prepare(`SELECT * FROM auth_challenges WHERE id=? AND consumed_at IS NULL AND expires_at>?`).get(payload.challengeId, now())
    if (!previous) fail(400, 'CHALLENGE_INVALID', 'The verification request has expired or is invalid. Start again.')
    const secondsSinceSent = Math.floor((Date.now() - Date.parse(previous.created_at)) / 1000)
    if (secondsSinceSent < 60) fail(429, 'RESEND_COOLDOWN', `Please wait ${60 - secondsSinceSent} seconds before requesting another code.`, { retryAfterSeconds: 60 - secondsSinceSent })
    const recentChallenges = Number((await prepare(`SELECT COUNT(*) AS count FROM auth_challenges WHERE user_id=? AND purpose=? AND channel=? AND created_at>?`).get(previous.user_id, previous.purpose, previous.channel, new Date(Date.now() - 15 * 60_000).toISOString())).count)
    if (recentChallenges >= 4) fail(429, 'RESEND_LIMIT_REACHED', 'Too many verification codes were requested. Please try again in 15 minutes.')
    const user = await q.userById.get(previous.user_id)
    const issued = await issueChallenge({ user, purpose: previous.purpose, channel: previous.channel, invitationId: previous.invitation_id })
    await prepare('UPDATE auth_challenges SET consumed_at=? WHERE id=?').run(now(), previous.id)
    return sendJson(response, 200, { message: 'A new verification code was issued.', ...issued, expiresInSeconds: 600 })
  }

  if (method === 'POST' && path === '/api/auth/login') {
    rateLimit(request, 'login', 12)
    const identifier = typeof payload.identifier === 'string' ? payload.identifier.trim() : ''
    rateLimit(request, 'login-account', 8, 60_000, normalizeEmail(identifier) || normalizePhone(identifier) || identifier)
    const user = await findUser(identifier)
    const hash = user ? user.password_hash : `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`
    const passwordOk = await verifyPassword(typeof payload.password === 'string' ? payload.password : '', hash)
    if (!user || !passwordOk) fail(401, 'CREDENTIALS_INVALID', 'Email/phone or password is incorrect.')
    if (user.status === 'suspended') fail(403, 'ACCOUNT_SUSPENDED', 'This account is paused. Contact support for help.')
    if (!user.email_verified_at && !user.phone_verified_at) {
      const channel = user.email ? 'email' : 'sms'
      const challenge = await issueChallenge({ user, purpose: 'registration', channel })
      return sendJson(response, 403, { code: 'CONTACT_VERIFICATION_REQUIRED', message: 'Verify your contact before signing in.', ...challenge, expiresInSeconds: 600 })
    }
    const userRoles = await q.roles.all(user.id)
    const requestedRole = payload.role
    const selected = requestedRole ? userRoles.find((item) => item.role === requestedRole) : userRoles.find((item) => item.role === 'Learner') || userRoles.find((item) => item.role === 'Parent') || userRoles[0]
    if (!selected) fail(403, 'ROLE_NOT_ASSIGNED', 'This account is not assigned to the selected role.')
    const session = await createSession(user.id, selected.role, selected.institutionId)
    await audit('auth.login', user.id, user.id, { role: selected.role })
    return sendJson(response, 200, { user: await safeUser(user, userRoles), activeRole: selected.role, expiresAt: session.expiresAt }, { 'Set-Cookie': cookieHeader(session.token, sessionDays * 86_400) })
  }

  if (method === 'POST' && path === '/api/auth/password/forgot') {
    rateLimit(request, 'password-forgot', 6)
    rateLimit(request, 'password-forgot-account', 3, 60_000, normalizeEmail(payload.identifier) || normalizePhone(payload.identifier) || '')
    const user = await findUser(payload.identifier)
    const channel = payload.channel === 'sms' ? 'sms' : 'email'
    if (channel === 'sms' && !mobileSasaReady()) fail(503, 'OTP_CHANNEL_UNAVAILABLE', 'SMS reset codes are not configured yet. Choose email or contact the administrator.')
    const placeholderId = genericRecoveryId()
    let challengeId = placeholderId
    if (user && user.status === 'active' && (channel === 'email' ? user.email : user.phone)) {
      const issued = await issueChallenge({ user, purpose: 'password_reset', channel })
      challengeId = issued.challengeId
      await audit('auth.password_reset_requested', user.id, user.id, { channel })
    }
    const deliveryMode = channel === 'sms' ? 'sms' : otpDelivery === 'resend' ? 'email' : 'console'
    return sendJson(response, 200, { message: 'If an active account matches, a verification code has been sent.', challengeId, deliveryMode, expiresInSeconds: 600 })
  }

  if (method === 'POST' && path === '/api/auth/password/verify') {
    rateLimit(request, 'password-verify', 10)
    const challenge = await otpChallenge(payload.challengeId, 'password_reset')
    const code = typeof payload.code === 'string' ? payload.code : ''
    if (!/^\d{6}$/.test(code) || !safeEqualHex(challenge.code_hash, hashOtp(challenge.id, code))) {
      await prepare('UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?').run(challenge.id)
      fail(400, 'CODE_INVALID', 'That verification code is incorrect. Check the code and try again.')
    }
    const token = randomBytes(32).toString('base64url')
    const timestamp = now()
    await prepare('UPDATE auth_challenges SET consumed_at=? WHERE id=?').run(timestamp, challenge.id)
    await prepare('INSERT INTO password_resets(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
      .run(randomUUID(), challenge.user_id, hashToken(token), expiry(10), timestamp)
    return sendJson(response, 200, { resetToken: token, expiresInSeconds: 600 })
  }

  if (method === 'POST' && path === '/api/auth/password/reset') {
    rateLimit(request, 'password-reset', 6)
    if (!validPassword(payload.newPassword)) fail(400, 'PASSWORD_WEAK', `Use a password between ${passwordMinLength} and 128 characters.`)
    const reset = await prepare('SELECT * FROM password_resets WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?').get(hashToken(String(payload.resetToken || '')), now())
    if (!reset) fail(400, 'RESET_TOKEN_INVALID', 'This password reset has expired. Request another code.')
    const passwordHash = await hashPassword(payload.newPassword)
    const timestamp = now()
    await db.transaction(async (tx) => {
      await tx.query('UPDATE users SET password_hash=$1,updated_at=$2 WHERE id=$3', [passwordHash, timestamp, reset.user_id])
      await tx.query('UPDATE password_resets SET consumed_at=$1 WHERE id=$2', [timestamp, reset.id])
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [reset.user_id])
    })
    await audit('auth.password_reset_completed', reset.user_id, reset.user_id)
    return sendJson(response, 200, { message: 'Password changed. Sign in with your new password.' }, { 'Set-Cookie': clearCookie() })
  }

  if (method === 'GET' && path === '/api/auth/me') {
    const auth = await getAuth(request)
    return sendJson(response, 200, { user: await safeUser(auth.user, auth.roles), activeRole: auth.context.role, institutionId: auth.context.institutionId, permissions: auth.context.permissions, expiresAt: auth.session.expires_at })
  }

  if (method === 'POST' && path === '/api/auth/active-role') {
    const auth = await getAuth(request)
    const context = await activeContext(auth.user.id, payload.role, payload.institutionId ?? null)
    await prepare('UPDATE sessions SET active_role=?,institution_id=?,last_seen_at=? WHERE id=?').run(context.role, context.institutionId, now(), auth.session.id)
    await audit('auth.active_role_changed', auth.user.id, auth.user.id, { role: context.role, institutionId: context.institutionId })
    return sendJson(response, 200, { activeRole: context.role, institutionId: context.institutionId, permissions: context.permissions })
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const auth = await getAuth(request)
    await prepare('DELETE FROM sessions WHERE id=?').run(auth.session.id)
    await audit('auth.logout', auth.user.id, auth.user.id)
    return sendJson(response, 200, { message: 'Signed out.' }, { 'Set-Cookie': clearCookie() })
  }

  if (method === 'POST' && path === '/api/auth/logout-all') {
    const auth = await getAuth(request)
    await prepare('DELETE FROM sessions WHERE user_id=?').run(auth.user.id)
    await audit('auth.logout_all', auth.user.id, auth.user.id)
    return sendJson(response, 200, { message: 'All sessions were signed out.' }, { 'Set-Cookie': clearCookie() })
  }

  if (method === 'POST' && path === '/api/auth/password/change') {
    const auth = await getAuth(request)
    if (!validPassword(payload.newPassword)) fail(400, 'PASSWORD_WEAK', `Use a password between ${passwordMinLength} and 128 characters.`)
    if (!await verifyPassword(String(payload.currentPassword || ''), auth.user.password_hash)) fail(401, 'CURRENT_PASSWORD_INVALID', 'Your current password is incorrect.')
    const passwordHash = await hashPassword(payload.newPassword)
    await prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(passwordHash, now(), auth.user.id)
    await prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(auth.user.id, auth.session.id)
    await audit('auth.password_changed', auth.user.id, auth.user.id)
    return sendJson(response, 200, { message: 'Password updated. Other sessions were signed out.' })
  }

  if (method === 'GET' && path === '/api/auth/role-access') {
    const auth = await getAuth(request)
    return sendJson(response, 200, { activeRole: auth.context.role, activePermissions: auth.context.permissions, roleMemberships: auth.roles.map((membership) => ({ ...membership, permissions: rolePermissions[membership.role] })) })
  }

  if (method === 'GET' && path === '/api/inbox/unread-count') {
    const auth = await getAuth(request)
    const row = await prepare(`SELECT COUNT(*) AS count FROM inbox_recipients WHERE recipient_user_id=? AND read_at IS NULL AND archived_at IS NULL`).get(auth.user.id)
    return sendJson(response, 200, { unreadCount: Number(row.count) })
  }

  if (method === 'GET' && path === '/api/marketplace/catalog') {
    const term = typeof url.searchParams.get('q') === 'string' ? url.searchParams.get('q')?.trim().slice(0, 100) : ''
    const curriculum = url.searchParams.get('curriculum')?.trim().slice(0, 120) || null
    const level = url.searchParams.get('level')?.trim().slice(0, 80) || null
    const grade = url.searchParams.get('grade')?.trim().slice(0, 80) || null
    const subject = url.searchParams.get('subject')?.trim().slice(0, 120) || null
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100)
    const filters = [`s.status='approved'`, `s.file_storage_key IS NOT NULL`]
    const values = []
    for (const [column, value] of [['curriculum', curriculum], ['level', level], ['grade', grade], ['subject', subject]]) {
      if (value) { values.push(value); filters.push(`s.${column}=$${values.length}`) }
    }
    if (term) { values.push(`%${term}%`); filters.push(`(s.title ILIKE $${values.length} OR s.description ILIKE $${values.length} OR s.subject ILIKE $${values.length})`) }
    values.push(limit)
    const products = await db.many(`SELECT s.id,s.title,s.description,s.curriculum,s.level,s.grade,s.subject,s.academic_year AS "academicYear",
      s.term,s.assessment_type AS "assessmentType",s.resource,s.page_count AS "pageCount",s.question_count AS "questionCount",
      s.formats,CASE WHEN s.product_type='series' THEN COALESCE(gp.unit_price_kes,s.price_kes) ELSE s.price_kes END AS "priceKes",s.product_type AS "productType",s.included_subjects AS "includedSubjects",i.name AS "institutionName",u.full_name AS "vendorName",s.published_at AS "publishedAt"
      FROM marketplace_submissions s LEFT JOIN guardian_exam_pricing gp ON upper(gp.grade_label)=upper(s.grade) JOIN institutions i ON i.id=s.institution_id JOIN users u ON u.id=s.teacher_user_id
      WHERE ${filters.join(' AND ')} ORDER BY s.published_at DESC,s.id DESC LIMIT $${values.length}`, values)
    return sendJson(response, 200, { products })
  }

  const catalogProductMatch = path.match(/^\/api\/marketplace\/catalog\/([0-9a-f-]+)$/i)
  if (method === 'GET' && catalogProductMatch) {
    const product = await prepare(`SELECT s.id,s.title,s.description,s.curriculum,s.level,s.grade,s.subject,s.academic_year AS "academicYear",
      s.term,s.assessment_type AS "assessmentType",s.resource,s.page_count AS "pageCount",s.question_count AS "questionCount",
      s.formats,CASE WHEN s.product_type='series' THEN COALESCE(gp.unit_price_kes,s.price_kes) ELSE s.price_kes END AS "priceKes",s.product_type AS "productType",s.included_subjects AS "includedSubjects",i.name AS "institutionName",u.full_name AS "vendorName",s.published_at AS "publishedAt"
      FROM marketplace_submissions s LEFT JOIN guardian_exam_pricing gp ON upper(gp.grade_label)=upper(s.grade) JOIN institutions i ON i.id=s.institution_id JOIN users u ON u.id=s.teacher_user_id
      WHERE s.id=? AND s.status='approved' AND s.file_storage_key IS NOT NULL`).get(catalogProductMatch[1])
    if (!product) fail(404, 'PRODUCT_NOT_FOUND', 'That approved marketplace resource was not found.')
    return sendJson(response, 200, { product })
  }

  if (method === 'GET' && path === '/api/marketplace/orders') {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner', 'Parent', 'School admin'])
    const orders = await prepare(`SELECT o.id,o.status,o.total_kes AS "totalKes",o.delivery_fee_kes AS "deliveryFeeKes",o.recipient_name AS "recipientName",o.recipient_phone AS "recipientPhone",o.delivery_address AS "deliveryAddress",o.fulfillment_status AS "fulfillmentStatus",o.carrier_name AS "carrierName",o.tracking_code AS "trackingCode",o.tracking_url AS "trackingUrl",o.payment_method AS "paymentMethod",o.payment_reference AS "paymentReference",
      o.is_simulated_payment AS "isSimulatedPayment",o.created_at AS "createdAt",o.paid_at AS "paidAt",
      COALESCE(json_agg(json_build_object('title',i.title_snapshot,'unitPriceKes',i.unit_price_kes,'quantity',i.quantity,'productType',i.product_type)) FILTER (WHERE i.id IS NOT NULL),'[]'::json) AS items
      FROM marketplace_orders o LEFT JOIN marketplace_order_items i ON i.order_id=o.id
      WHERE o.buyer_user_id=? GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`).all(auth.user.id)
    return sendJson(response, 200, { orders })
  }

  if (method === 'POST' && path === '/api/marketplace/orders') {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner', 'Parent', 'School admin'])
    rateLimit(request, 'marketplace-order', 10, 60_000, auth.user.id)
    const requestedItems = Array.isArray(payload.items) ? payload.items : []
    const productIds = requestedItems.length ? [...new Set(requestedItems.map((item) => item?.productId).filter((id) => typeof id === 'string'))] : Array.isArray(payload.productIds) ? [...new Set(payload.productIds.filter((id) => typeof id === 'string'))] : []
    if (!productIds.length || productIds.length > 20 || productIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) fail(400, 'ORDER_ITEMS_INVALID', 'Select between 1 and 20 valid marketplace products.')
    const recipientName = typeof payload.recipientName === 'string' ? payload.recipientName.trim().slice(0, 160) : ''
    const recipientPhone = normalizeMpesaPhone(payload.recipientPhone)
    const deliveryAddress = typeof payload.deliveryAddress === 'string' ? payload.deliveryAddress.trim().slice(0, 500) : ''
    if (recipientName.length < 2 || !recipientPhone || deliveryAddress.length < 5) fail(400, 'DELIVERY_DETAILS_REQUIRED', 'Enter the recipient name, a valid Kenyan phone number, and a delivery address.')
    const products = await db.many(`SELECT s.id,s.teacher_user_id AS "sellerUserId",s.title,s.file_storage_key AS "fileStorageKey",s.uploaded_file_name AS "fileName",s.file_mime_type AS "fileMimeType",
      CASE WHEN s.product_type='series' THEN COALESCE(gp.unit_price_kes,s.price_kes) ELSE s.price_kes END AS "priceKes",s.product_type AS "productType"
      FROM marketplace_submissions s LEFT JOIN guardian_exam_pricing gp ON upper(gp.grade_label)=upper(s.grade)
      WHERE s.status='approved' AND s.file_storage_key IS NOT NULL AND s.id=ANY($1::uuid[])`, [productIds])
    if (products.length !== productIds.length) fail(409, 'PRODUCTS_UNAVAILABLE', 'One or more selected products are no longer available.')
    if (products.some((product) => product.sellerUserId === auth.user.id)) fail(409, 'OWN_PRODUCT_ORDER', 'You cannot purchase your own marketplace resource.')
    const orderId = randomUUID()
    const createdAt = now()
    const items = products.map((product) => {
      const quantity = Math.max(1, Math.min(1000, Number(requestedItems.find((item) => item?.productId === product.id)?.quantity || 1)))
      if (!Number.isInteger(quantity)) fail(400, 'ORDER_QUANTITY_INVALID', 'Enter a whole number quantity for each product.')
      const price = Math.round(Number(product.priceKes) * 100) / 100
      const lineTotal = Math.round(price * quantity * 100) / 100
      const sellerAmount = Math.round(lineTotal * marketplaceVendorSharePercent) / 100
      return { ...product, price, quantity, sellerAmount, platformAmount: Math.round((lineTotal - sellerAmount) * 100) / 100 }
    })
    const deliveryFeeSetting = await db.one(`SELECT setting_value FROM guardian_exam_settings WHERE setting_key='delivery_fee_kes'`)
    const deliveryFeeKes = Math.max(0, Number(deliveryFeeSetting?.setting_value ?? 300))
    const subtotalKes = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
    const totalKes = subtotalKes + deliveryFeeKes
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO marketplace_orders(id,buyer_user_id,total_kes,delivery_fee_kes,recipient_name,recipient_phone,delivery_address,whatsapp_updates_opt_in,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [orderId, auth.user.id, totalKes, deliveryFeeKes, recipientName, recipientPhone, deliveryAddress, payload.whatsappUpdatesOptIn === true, createdAt])
      for (const item of items) await tx.query(`INSERT INTO marketplace_order_items(order_id,submission_id,seller_user_id,title_snapshot,unit_price_kes,quantity,product_type,file_storage_key_snapshot,file_name_snapshot,file_mime_type_snapshot,seller_share_percent,seller_amount_kes,platform_amount_kes,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [orderId, item.id, item.sellerUserId, item.title, item.price, item.quantity, item.productType, item.fileStorageKey, item.fileName, item.fileMimeType, marketplaceVendorSharePercent, item.sellerAmount, item.platformAmount, createdAt])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'marketplace.order_created',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ orderId, productCount: items.length, subtotalKes, deliveryFeeKes, totalKes, physicalDelivery: true }), createdAt])
    })
    return sendJson(response, 201, { order: { id: orderId, status: 'awaiting_payment', totalKes, subtotalKes, deliveryFeeKes, currency: 'KES', isSimulatedPayment: true, items: items.map(({ id, title, price, quantity, productType }) => ({ productId: id, title, priceKes: price, quantity, productType })), message: 'Order prepared. Payment has not been requested or charged.' } })
  }

  const orderMatch = path.match(/^\/api\/marketplace\/orders\/([0-9a-f-]+)$/i)
  if (method === 'GET' && orderMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner', 'Parent', 'School admin'])
    const order = await prepare(`SELECT id,status,total_kes AS "totalKes",delivery_fee_kes AS "deliveryFeeKes",recipient_name AS "recipientName",recipient_phone AS "recipientPhone",delivery_address AS "deliveryAddress",fulfillment_status AS "fulfillmentStatus",carrier_name AS "carrierName",tracking_code AS "trackingCode",tracking_url AS "trackingUrl",payment_method AS "paymentMethod",payment_reference AS "paymentReference",
      is_simulated_payment AS "isSimulatedPayment",payment_error AS "paymentError",created_at AS "createdAt",paid_at AS "paidAt"
      FROM marketplace_orders WHERE id=? AND buyer_user_id=?`).get(orderMatch[1], auth.user.id)
    if (!order) fail(404, 'ORDER_NOT_FOUND', 'That order was not found.')
    order.items = await prepare(`SELECT id,submission_id AS "productId",title_snapshot AS title,unit_price_kes AS "priceKes",quantity,product_type AS "productType"
      FROM marketplace_order_items WHERE order_id=? ORDER BY created_at`).all(order.id)
    return sendJson(response, 200, { order })
  }

  const mpesaStartMatch = path.match(/^\/api\/marketplace\/orders\/([0-9a-f-]+)\/mpesa\/stk$/i)
  if (method === 'POST' && mpesaStartMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner', 'Parent', 'School admin'])
    rateLimit(request, 'marketplace-mpesa-stk', 4, 60_000, auth.user.id)
    if (!darajaConfig().ready) fail(503, 'MPESA_NOT_CONFIGURED', 'M-PESA checkout is not available yet. Please try again later.')
    const phone = normalizeMpesaPhone(payload.phone)
    if (!phone) fail(400, 'MPESA_PHONE_INVALID', 'Enter a valid Kenyan Safaricom number.')
    const orderId = mpesaStartMatch[1]
    const order = await db.transaction(async (tx) => {
      const current = await tx.one('SELECT * FROM marketplace_orders WHERE id=$1 AND buyer_user_id=$2 FOR UPDATE', [orderId, auth.user.id])
      if (!current) fail(404, 'ORDER_NOT_FOUND', 'That order was not found.')
      if (current.status === 'payment_pending') fail(409, 'PAYMENT_ALREADY_PENDING', 'A payment request is already pending. Wait for confirmation before trying again.')
      if (!['awaiting_payment', 'payment_failed'].includes(current.status) || (current.status === 'awaiting_payment' && !current.is_simulated_payment) || (current.status === 'payment_failed' && current.payment_method !== 'mpesa_daraja')) fail(409, 'ORDER_NOT_PAYABLE', 'This order cannot start a new payment.')
      const amount = Number(current.total_kes)
      if (!Number.isSafeInteger(amount) || amount < 1) fail(400, 'MPESA_AMOUNT_INVALID', 'This order total must be a whole-number KSh amount greater than zero.')
      return tx.one(`UPDATE marketplace_orders SET status='payment_pending',payment_method='mpesa_daraja',is_simulated_payment=false,
        payer_phone=$1,payment_error=NULL,mpesa_result_code=NULL,updated_at=$2 WHERE id=$3 RETURNING id,total_kes`, [phone, now(), current.id])
    })
    try {
      const started = await initiateStkPush({ phone, amount: Number(order.total_kes), accountReference: order.id.replaceAll('-', '').slice(0, 12).toUpperCase(), description: 'Guardian Exams' })
      await prepare(`UPDATE marketplace_orders SET checkout_request_id=?,merchant_request_id=?,payment_error=NULL,updated_at=? WHERE id=? AND status='payment_pending'`)
        .run(started.checkoutRequestId, started.merchantRequestId, now(), order.id)
      return sendJson(response, 202, { order: { id: order.id, status: 'payment_pending', totalKes: Number(order.total_kes), isSimulatedPayment: false }, message: started.customerMessage })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Safaricom could not start this payment.'
      if (error instanceof DarajaRequestError && error.ambiguous) {
        await prepare(`UPDATE marketplace_orders SET payment_error=?,updated_at=? WHERE id=? AND status='payment_pending'`).run(message.slice(0, 300), now(), order.id)
        return sendJson(response, 202, { order: { id: order.id, status: 'payment_pending', totalKes: Number(order.total_kes), isSimulatedPayment: false }, message })
      }
      await prepare(`UPDATE marketplace_orders SET status='payment_failed',payment_error=?,updated_at=? WHERE id=? AND status='payment_pending'`).run(message.slice(0, 300), now(), order.id)
      fail(502, 'MPESA_STK_FAILED', message)
    }
  }

  const simulatePaymentMatch = path.match(/^\/api\/marketplace\/orders\/([0-9a-f-]+)\/simulate-payment$/i)
  if (method === 'POST' && simulatePaymentMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Learner', 'Parent', 'School admin'])
    rateLimit(request, 'marketplace-simulated-payment', 10, 60_000, auth.user.id)
    const paidAt = now()
    const paymentReference = `DEMO-${randomUUID().slice(0, 12).toUpperCase()}`
    const order = await db.transaction(async (tx) => {
      const current = await tx.one(`SELECT * FROM marketplace_orders WHERE id=$1 AND buyer_user_id=$2 FOR UPDATE`, [simulatePaymentMatch[1], auth.user.id])
      if (!current) fail(404, 'ORDER_NOT_FOUND', 'That order was not found.')
      if (!current.is_simulated_payment) fail(409, 'SIMULATION_DISABLED', 'This order uses live payment and cannot be marked paid by the demo action.')
      if (current.status !== 'awaiting_payment') fail(409, 'ORDER_NOT_PAYABLE', 'This order is not awaiting simulated payment.')
      const items = await tx.many(`SELECT * FROM marketplace_order_items WHERE order_id=$1 ORDER BY seller_user_id,id`, [current.id])
      await tx.query(`UPDATE marketplace_orders SET status='paid',fulfillment_status='processing',payment_method='mpesa_demo',payment_reference=$1,paid_at=$2,updated_at=$2 WHERE id=$3`, [paymentReference, paidAt, current.id])
      for (const item of items) {
        await tx.query(`INSERT INTO seller_settlements(order_item_id,seller_user_id,amount_kes,created_at) VALUES($1,$2,$3,$4)
          ON CONFLICT(order_item_id) DO NOTHING`, [item.id, item.seller_user_id, item.seller_amount_kes, paidAt])
        if (Number(item.seller_amount_kes) > 0) {
          await ensureWalletAccount(tx, item.seller_user_id)
          await tx.query(`INSERT INTO wallet_ledger(user_id,entry_type,bucket,amount_kes,reference_type,reference_id,actor_user_id,created_at)
            VALUES($1,'sale_pending','pending',$2,'marketplace_order_item',$3,$4,$5) ON CONFLICT DO NOTHING`, [item.seller_user_id, item.seller_amount_kes, item.id, auth.user.id, paidAt])
        }
      }
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'marketplace.demo_payment_confirmed',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ orderId: current.id, paymentReference }), paidAt])
      return current
    })
    return sendJson(response, 200, { order: { id: order.id, status: 'paid', totalKes: order.total_kes, paymentMethod: 'mpesa_demo', paymentReference, paidAt, isSimulatedPayment: true }, message: 'Demo payment confirmed. No M-PESA request was sent and no money was transferred.' })
  }

  if (method === 'GET' && path === '/api/teacher/wallet') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const balances = await walletBalances(db, auth.user.id)
    const payouts = await prepare(`SELECT id,amount_kes AS "amountKes",destination_phone AS "destinationPhone",status,request_note AS "requestNote",
      review_note AS "reviewNote",requested_at AS "requestedAt",reviewed_at AS "reviewedAt",paid_at AS "paidAt"
      FROM teacher_payout_requests WHERE teacher_user_id=? ORDER BY requested_at DESC LIMIT 50`).all(auth.user.id)
    const settlements = await prepare(`SELECT st.id,st.amount_kes AS "amountKes",st.status,st.created_at AS "createdAt",st.settled_at AS "settledAt",oi.title_snapshot AS title
      FROM seller_settlements st JOIN marketplace_order_items oi ON oi.id=st.order_item_id
      WHERE st.seller_user_id=? ORDER BY st.created_at DESC LIMIT 100`).all(auth.user.id)
    return sendJson(response, 200, { currency: 'KES', balances, payouts, settlements, sharePercent: marketplaceVendorSharePercent, simulatedOnly: true })
  }

  if (method === 'GET' && path === '/api/teacher/wallet/transactions') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100)
    const entries = await prepare(`SELECT id,entry_type AS "entryType",bucket,amount_kes AS "amountKes",reference_type AS "referenceType",
      reference_id AS "referenceId",created_at AS "createdAt" FROM wallet_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(auth.user.id, limit)
    return sendJson(response, 200, { entries })
  }

  if (method === 'POST' && path === '/api/teacher/wallet/payouts') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    rateLimit(request, 'teacher-payout-request', 5, 60_000, auth.user.id)
    const amountKes = Math.round(Number(payload.amountKes ?? payload.amount) * 100) / 100
    const destinationPhone = normalizePhone(payload.phone || auth.user.phone)
    const requestNote = typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim().slice(0, 500) : null
    if (!Number.isFinite(amountKes) || amountKes < 100 || amountKes > 1_000_000_000) fail(400, 'PAYOUT_AMOUNT_INVALID', 'Request at least KSh 100 and no more than KSh 1,000,000,000.')
    if (!destinationPhone || !phonePattern.test(destinationPhone)) fail(400, 'PAYOUT_PHONE_INVALID', 'Enter a valid M-PESA mobile number with country code.')
    const payoutId = randomUUID()
    const requestedAt = now()
    const result = await db.transaction(async (tx) => {
      await ensureWalletAccount(tx, auth.user.id)
      const balances = await walletBalances(tx, auth.user.id)
      if (balances.available < amountKes) fail(409, 'INSUFFICIENT_AVAILABLE_BALANCE', 'Your available wallet balance is not enough for this payout request.', { availableKes: balances.available })
      await tx.query(`INSERT INTO teacher_payout_requests(id,teacher_user_id,amount_kes,destination_phone,request_note,requested_at) VALUES($1,$2,$3,$4,$5,$6)`, [payoutId, auth.user.id, amountKes, destinationPhone, requestNote, requestedAt])
      await tx.query(`INSERT INTO wallet_ledger(user_id,entry_type,bucket,amount_kes,reference_type,reference_id,actor_user_id,created_at)
        VALUES($1,'payout_reserved','available',$2,'payout_request',$3,$4,$5),($1,'payout_reserved','reserved',$6,'payout_request',$3,$4,$5)`, [auth.user.id, -amountKes, payoutId, auth.user.id, requestedAt, amountKes])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'teacher.payout_requested',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ payoutId, amountKes, destinationPhone }), requestedAt])
      return await tx.one(`SELECT id,amount_kes AS "amountKes",destination_phone AS "destinationPhone",status,requested_at AS "requestedAt" FROM teacher_payout_requests WHERE id=$1`, [payoutId])
    })
    return sendJson(response, 201, { payout: result, message: 'Payout request queued for administrator approval. No transfer has been sent.' })
  }

  if (method === 'GET' && path === '/api/teacher/marketplace-submissions') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const submissions = await prepare(`SELECT id,title,description,curriculum,level,grade,subject,product_type AS "productType",included_subjects AS "includedSubjects",academic_year AS "year",term,
      assessment_type AS "type",resource,page_count AS pages,question_count AS questions,formats,CASE WHEN product_type='series' THEN COALESCE((SELECT unit_price_kes FROM guardian_exam_pricing WHERE upper(grade_label)=upper(marketplace_submissions.grade)),price_kes) ELSE price_kes END AS price,
      uploaded_file_name AS "fileName",file_mime_type AS "fileMimeType",file_size_bytes AS "fileSizeBytes",(file_storage_key IS NOT NULL) AS "fileUploaded",rights_confirmed AS "rightsConfirmed",status,review_note AS "reviewNote",
      submitted_at AS "submittedAt",created_at AS "createdAt",updated_at AS "updatedAt"
      FROM marketplace_submissions WHERE teacher_user_id=? ORDER BY updated_at DESC`).all(auth.user.id)
    return sendJson(response, 200, { submissions })
  }

  if (method === 'POST' && path === '/api/teacher/marketplace-submissions') {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    if (!auth.context.institutionId) fail(403, 'INSTITUTION_REQUIRED', 'Select an institution role before submitting marketplace content.')
    const fields = marketplaceSubmissionFields(payload)
    const created = await prepare(`INSERT INTO marketplace_submissions(teacher_user_id,institution_id,title,description,curriculum,level,grade,subject,
      academic_year,term,assessment_type,resource,page_count,question_count,formats,price_kes,sample_file_label,rights_confirmed,product_type,included_subjects)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb) RETURNING id,status,created_at AS "createdAt"`).get(
      auth.user.id, auth.context.institutionId, fields.title, fields.description, fields.curriculum, fields.level, fields.grade, fields.subject,
      fields.academicYear, fields.term, fields.assessmentType, fields.resource, fields.pageCount, fields.questionCount, JSON.stringify(fields.formats),
      fields.priceKes, null, fields.rightsConfirmed, fields.productType, JSON.stringify(fields.includedSubjects))
    await audit('marketplace.submission_draft_created', auth.user.id, auth.user.id, { submissionId: created.id, institutionId: auth.context.institutionId })
    return sendJson(response, 201, { submission: created })
  }

  const teacherSubmissionMatch = path.match(/^\/api\/teacher\/marketplace-submissions\/([0-9a-f-]+)$/i)
  if (method === 'PATCH' && teacherSubmissionMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const fields = marketplaceSubmissionFields(payload)
    const updated = await prepare(`UPDATE marketplace_submissions SET title=?,description=?,curriculum=?,level=?,grade=?,subject=?,academic_year=?,term=?,
      assessment_type=?,resource=?,page_count=?,question_count=?,formats=?::jsonb,price_kes=?,sample_file_label=NULL,rights_confirmed=?,product_type=?,included_subjects=?::jsonb,updated_at=?
      WHERE id=? AND teacher_user_id=? AND status IN ('draft','changes_requested')
      RETURNING id,status,review_note AS "reviewNote",updated_at AS "updatedAt"`).get(
      fields.title, fields.description, fields.curriculum, fields.level, fields.grade, fields.subject, fields.academicYear, fields.term,
      fields.assessmentType, fields.resource, fields.pageCount, fields.questionCount, JSON.stringify(fields.formats), fields.priceKes,
      fields.rightsConfirmed, fields.productType, JSON.stringify(fields.includedSubjects), now(), teacherSubmissionMatch[1], auth.user.id)
    if (!updated) fail(404, 'EDITABLE_SUBMISSION_NOT_FOUND', 'That submission is not editable or does not belong to your account.')
    await audit('marketplace.submission_updated', auth.user.id, auth.user.id, { submissionId: updated.id })
    return sendJson(response, 200, { submission: updated })
  }

  const teacherSubmitMatch = path.match(/^\/api\/teacher\/marketplace-submissions\/([0-9a-f-]+)\/submit$/i)
  if (method === 'POST' && teacherSubmitMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Teacher'])
    const existing = await prepare(`SELECT id,rights_confirmed AS "rightsConfirmed",status,product_type AS "productType",included_subjects AS "includedSubjects",curriculum,grade,file_storage_key AS "fileStorageKey"
      FROM marketplace_submissions WHERE id=? AND teacher_user_id=?`).get(teacherSubmitMatch[1], auth.user.id)
    if (!existing || !['draft', 'changes_requested'].includes(existing.status)) fail(409, 'SUBMISSION_NOT_READY', 'This submission cannot be sent for review in its current state.')
    if (!existing.rightsConfirmed) fail(400, 'RIGHTS_CONFIRMATION_REQUIRED', 'Confirm that you have the rights to sell this material before submitting.')
    if (!existing.fileStorageKey) fail(400, 'PRINT_MASTER_REQUIRED', 'Upload the actual PDF or ZIP print master before submitting for review.')
    await assertCompleteMarketplaceSeries(existing)
    const submitted = await prepare(`UPDATE marketplace_submissions SET status='submitted',submitted_at=?,updated_at=?,review_note=NULL,reviewed_by=NULL,reviewed_at=NULL
      WHERE id=? AND teacher_user_id=? RETURNING id,status,submitted_at AS "submittedAt"`).get(now(), now(), existing.id, auth.user.id)
    await audit('marketplace.submission_sent_for_review', auth.user.id, auth.user.id, { submissionId: existing.id, institutionId: auth.context.institutionId })
    return sendJson(response, 200, { submission: submitted, message: 'Submission sent for administrator review.' })
  }

  if (method === 'GET' && path === '/api/inbox') {
    const auth = await getAuth(request)
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1), 100)
    const before = url.searchParams.get('before')
    const unreadOnly = url.searchParams.get('unread') === 'true'
    const beforeTime = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null
    const rows = await prepare(`SELECT m.id,m.subject,m.body,m.category,m.is_announcement AS "isAnnouncement",
      m.created_at AS "createdAt",r.read_at AS "readAt",s.id AS "senderId",s.full_name AS "senderName"
      FROM inbox_recipients r JOIN inbox_messages m ON m.id=r.message_id LEFT JOIN users s ON s.id=m.sender_user_id
      WHERE r.recipient_user_id=? AND r.archived_at IS NULL AND (CAST(? AS timestamptz) IS NULL OR m.created_at < CAST(? AS timestamptz))
        AND (CAST(? AS boolean)=false OR r.read_at IS NULL)
      ORDER BY m.created_at DESC,m.id DESC LIMIT ?`).all(auth.user.id, beforeTime, beforeTime, unreadOnly, limit + 1)
    const hasMore = rows.length > limit
    const messages = rows.slice(0, limit)
    return sendJson(response, 200, { messages, hasMore, nextBefore: hasMore ? messages[messages.length - 1].createdAt : null })
  }

  if (method === 'GET' && path === '/api/inbox/sent') {
    const auth = await getAuth(request)
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1), 100)
    const messages = await prepare(`SELECT m.id,m.subject,m.body,m.category,m.is_announcement AS "isAnnouncement",m.created_at AS "createdAt",
      COUNT(r.recipient_user_id)::int AS "recipientCount",STRING_AGG(u.full_name, ', ' ORDER BY u.full_name) AS "recipientNames"
      FROM inbox_messages m LEFT JOIN inbox_recipients r ON r.message_id=m.id LEFT JOIN users u ON u.id=r.recipient_user_id
      WHERE m.sender_user_id=? GROUP BY m.id ORDER BY m.created_at DESC LIMIT ?`).all(auth.user.id, limit)
    return sendJson(response, 200, { messages })
  }

  if (method === 'POST' && path === '/api/inbox/support') {
    const auth = await getAuth(request)
    if (auth.context.role === 'Platform admin') fail(409, 'ADMIN_SUPPORT_ROUTE_NOT_ALLOWED', 'Use a direct reply or an administrator announcement from the platform inbox.')
    rateLimit(request, 'inbox-support-send', 5, 60_000, auth.user.id)
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    if (subject.length < 1 || subject.length > 180) fail(400, 'SUBJECT_INVALID', 'Enter a subject up to 180 characters.')
    if (body.length < 1 || body.length > 10000) fail(400, 'MESSAGE_INVALID', 'Enter a message up to 10,000 characters.')
    const messageId = randomUUID()
    const createdAt = now()
    const recipientCount = await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO inbox_messages(id,sender_user_id,subject,body,category,created_at) VALUES($1,$2,$3,$4,'support',$5)`, [messageId, auth.user.id, subject, body, createdAt])
      const inserted = await tx.query(`INSERT INTO inbox_recipients(message_id,recipient_user_id,created_at)
        SELECT $1,u.id,$2 FROM users u JOIN user_roles r ON r.user_id=u.id
        WHERE u.status='active' AND r.role='Platform admin' AND r.institution_id IS NULL AND u.id<>$3`, [messageId, createdAt, auth.user.id])
      if (!inserted.rowCount) fail(503, 'SUPPORT_UNAVAILABLE', 'The support inbox is not available right now. Please try again later.')
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'inbox.support_message_sent',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ messageId, recipientCount: inserted.rowCount }), createdAt])
      return inserted.rowCount
    })
    return sendJson(response, 201, { message: { id: messageId, subject, createdAt }, recipientCount, messageText: 'Your message is in the administrator inbox.' })
  }

  if (method === 'POST' && path === '/api/inbox/messages') {
    const auth = await getAuth(request)
    rateLimit(request, 'inbox-send', 20, 60_000, auth.user.id)
    const recipientId = typeof payload.recipientUserId === 'string' ? payload.recipientUserId : ''
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    const category = ['general', 'support', 'orders', 'marketplace', 'system'].includes(payload.category) ? payload.category : 'general'
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipientId)) fail(400, 'RECIPIENT_INVALID', 'Choose a valid recipient account.')
    if (recipientId === auth.user.id) fail(400, 'SELF_MESSAGE_NOT_ALLOWED', 'You cannot send an inbox message to yourself.')
    if (subject.length < 1 || subject.length > 180) fail(400, 'SUBJECT_INVALID', 'Enter a subject up to 180 characters.')
    if (body.length < 1 || body.length > 10000) fail(400, 'MESSAGE_INVALID', 'Enter a message up to 10,000 characters.')
    const recipient = await q.userById.get(recipientId)
    if (!recipient || recipient.status !== 'active') fail(404, 'RECIPIENT_NOT_FOUND', 'That active user account was not found.')
    const messageId = randomUUID()
    const createdAt = now()
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO inbox_messages(id,sender_user_id,subject,body,category,created_at) VALUES($1,$2,$3,$4,$5,$6)`, [messageId, auth.user.id, subject, body, category, createdAt])
      await tx.query(`INSERT INTO inbox_recipients(message_id,recipient_user_id,created_at) VALUES($1,$2,$3)`, [messageId, recipientId, createdAt])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [randomUUID(), auth.user.id, 'inbox.message_sent', recipientId, JSON.stringify({ messageId, category }), createdAt])
    })
    return sendJson(response, 201, { message: { id: messageId, subject, body, category, createdAt, recipient: { id: recipient.id, fullName: recipient.full_name } } })
  }

  const inboxReadMatch = path.match(/^\/api\/inbox\/([0-9a-f-]+)\/read$/i)
  if (method === 'PATCH' && inboxReadMatch) {
    const auth = await getAuth(request)
    const result = await prepare(`UPDATE inbox_recipients SET read_at=COALESCE(read_at,?)
      WHERE message_id=? AND recipient_user_id=? AND archived_at IS NULL RETURNING message_id AS "messageId",read_at AS "readAt"`).get(now(), inboxReadMatch[1], auth.user.id)
    if (!result) fail(404, 'INBOX_MESSAGE_NOT_FOUND', 'That inbox message was not found.')
    return sendJson(response, 200, { message: result })
  }

  const inboxArchiveMatch = path.match(/^\/api\/inbox\/([0-9a-f-]+)\/archive$/i)
  if (method === 'PATCH' && inboxArchiveMatch) {
    const auth = await getAuth(request)
    const result = await prepare(`UPDATE inbox_recipients SET archived_at=?
      WHERE message_id=? AND recipient_user_id=? AND archived_at IS NULL RETURNING message_id AS "messageId",archived_at AS "archivedAt"`).get(now(), inboxArchiveMatch[1], auth.user.id)
    if (!result) fail(404, 'INBOX_MESSAGE_NOT_FOUND', 'That inbox message was not found.')
    return sendJson(response, 200, { message: result })
  }

  const inboxMessageMatch = path.match(/^\/api\/inbox\/([0-9a-f-]+)$/i)
  if (method === 'GET' && inboxMessageMatch) {
    const auth = await getAuth(request)
    const message = await prepare(`SELECT m.id,m.subject,m.body,m.category,m.is_announcement AS "isAnnouncement",m.created_at AS "createdAt",
      r.read_at AS "readAt",s.id AS "senderId",s.full_name AS "senderName"
      FROM inbox_recipients r JOIN inbox_messages m ON m.id=r.message_id LEFT JOIN users s ON s.id=m.sender_user_id
      WHERE r.message_id=? AND r.recipient_user_id=? AND r.archived_at IS NULL`).get(inboxMessageMatch[1], auth.user.id)
    if (!message) fail(404, 'INBOX_MESSAGE_NOT_FOUND', 'That inbox message was not found.')
    return sendJson(response, 200, { message })
  }

  if (method === 'POST' && path === '/api/admin/inbox/announcements') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    rateLimit(request, 'admin-announcement', 20, 60_000, auth.user.id)
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    const audience = payload.audience || 'all'
    const audienceRole = payload.role
    const institutionId = typeof payload.institutionId === 'string' && payload.institutionId.trim() ? payload.institutionId.trim() : null
    if (subject.length < 1 || subject.length > 180) fail(400, 'SUBJECT_INVALID', 'Enter a subject up to 180 characters.')
    if (body.length < 1 || body.length > 10000) fail(400, 'MESSAGE_INVALID', 'Enter an announcement up to 10,000 characters.')
    if (!['all', 'role'].includes(audience)) fail(400, 'ANNOUNCEMENT_AUDIENCE_INVALID', 'Choose all users or a role audience.')
    if (audience === 'role' && !roles.includes(audienceRole)) fail(400, 'AUDIENCE_ROLE_INVALID', 'Choose a supported role for the announcement audience.')
    if (institutionId && audience !== 'role') fail(400, 'INSTITUTION_AUDIENCE_INVALID', 'Choose a role audience before selecting an institution.')
    if (institutionId && !await prepare(`SELECT 1 AS found FROM institutions WHERE id=? AND status='active'`).get(institutionId)) fail(400, 'INSTITUTION_NOT_FOUND', 'Choose an active institution for this announcement.')
    const messageId = randomUUID()
    const createdAt = now()
    let recipientSql = `INSERT INTO inbox_recipients(message_id,recipient_user_id,created_at)
      SELECT $1,u.id,$2 FROM users u WHERE u.status='active'`
    const values = [messageId, createdAt]
    if (audience === 'role') {
      recipientSql += ` AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role=$3`
      values.push(audienceRole)
      if (institutionId) { recipientSql += ` AND ur.institution_id=$4`; values.push(institutionId) }
      recipientSql += ')'
    }
    const result = await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO inbox_messages(id,sender_user_id,subject,body,category,is_announcement,created_at) VALUES($1,$2,$3,$4,'system',true,$5)`, [messageId, auth.user.id, subject, body, createdAt])
      const inserted = await tx.query(recipientSql, values)
      if (!inserted.rowCount) fail(409, 'ANNOUNCEMENT_AUDIENCE_EMPTY', 'No active users match this announcement audience.')
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'admin.inbox_announcement_sent',$3::jsonb,$4)`, [randomUUID(), auth.user.id, JSON.stringify({ messageId, audience, role: audience === 'role' ? audienceRole : null, institutionId, recipientCount: inserted.rowCount }), createdAt])
      return inserted.rowCount
    })
    return sendJson(response, 201, { announcement: { id: messageId, subject, audience, ...(audience === 'role' ? { role: audienceRole } : {}), institutionId, recipientCount: result, createdAt } })
  }

  if (method === 'GET' && path === '/api/admin/users') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const rows = await prepare(`SELECT u.id,u.full_name AS "fullName",u.email,u.phone,u.status,u.created_at AS "createdAt",
      STRING_AGG(r.role, '|') AS "roleNames" FROM users u LEFT JOIN user_roles r ON r.user_id=u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 250`).all()
    return sendJson(response, 200, { users: rows.map((row) => ({ ...row, roles: row.roleNames ? row.roleNames.split('|') : [] })) })
  }

  if (method === 'GET' && path === '/api/admin/marketplace-submissions') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = url.searchParams.get('status') || 'submitted'
    if (!['submitted', 'approved', 'changes_requested', 'rejected', 'all'].includes(status)) fail(400, 'SUBMISSION_STATUS_INVALID', 'Choose a valid moderation status.')
    const submissions = await prepare(`SELECT s.id,s.teacher_user_id AS "teacherUserId",u.full_name AS "teacherName",u.email AS "teacherEmail",
      i.id AS "institutionId",i.name AS "institutionName",s.title,s.description,s.curriculum,s.level,s.grade,s.subject,s.product_type AS "productType",s.included_subjects AS "includedSubjects",
      s.academic_year AS "year",s.term,s.assessment_type AS "type",s.resource,s.page_count AS pages,s.question_count AS questions,
      s.formats,CASE WHEN s.product_type='series' THEN COALESCE(gp.unit_price_kes,s.price_kes) ELSE s.price_kes END AS price,s.uploaded_file_name AS "fileName",s.file_mime_type AS "fileMimeType",s.file_size_bytes AS "fileSizeBytes",(s.file_storage_key IS NOT NULL) AS "fileUploaded",s.rights_confirmed AS "rightsConfirmed",s.status,
      s.review_note AS "reviewNote",s.submitted_at AS "submittedAt",s.reviewed_at AS "reviewedAt",s.created_at AS "createdAt"
      FROM marketplace_submissions s LEFT JOIN guardian_exam_pricing gp ON upper(gp.grade_label)=upper(s.grade) JOIN users u ON u.id=s.teacher_user_id JOIN institutions i ON i.id=s.institution_id
      WHERE (?='all' OR s.status=?) ORDER BY s.submitted_at DESC NULLS LAST,s.created_at DESC LIMIT 250`).all(status, status)
    return sendJson(response, 200, { submissions })
  }

  if (method === 'GET' && path === '/api/admin/marketplace-settlements') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = url.searchParams.get('status') || 'pending'
    if (!['pending', 'settled', 'all'].includes(status)) fail(400, 'SETTLEMENT_STATUS_INVALID', 'Choose pending, settled or all settlements.')
    const settlements = await prepare(`SELECT st.id,st.order_item_id AS "orderItemId",st.seller_user_id AS "sellerUserId",u.full_name AS "teacherName",
      i.name AS "institutionName",st.amount_kes AS "amountKes",st.status,st.created_at AS "createdAt",st.settled_at AS "settledAt",
      oi.title_snapshot AS title,o.id AS "orderId"
      FROM seller_settlements st JOIN users u ON u.id=st.seller_user_id JOIN marketplace_order_items oi ON oi.id=st.order_item_id
      JOIN marketplace_orders o ON o.id=oi.order_id JOIN marketplace_submissions s ON s.id=oi.submission_id JOIN institutions i ON i.id=s.institution_id
      WHERE (?='all' OR st.status=?) ORDER BY st.created_at DESC LIMIT 300`).all(status, status)
    return sendJson(response, 200, { settlements })
  }

  const settlementApproveMatch = path.match(/^\/api\/admin\/marketplace-settlements\/([0-9a-f-]+)\/approve$/i)
  if (method === 'POST' && settlementApproveMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const settledAt = now()
    const settled = await db.transaction(async (tx) => {
      const settlement = await tx.one(`SELECT * FROM seller_settlements WHERE id=$1 FOR UPDATE`, [settlementApproveMatch[1]])
      if (!settlement || settlement.status !== 'pending') fail(404, 'PENDING_SETTLEMENT_NOT_FOUND', 'That settlement is not waiting for approval.')
      await ensureWalletAccount(tx, settlement.seller_user_id)
      const balances = await walletBalances(tx, settlement.seller_user_id)
      const amountKes = Math.round(Number(settlement.amount_kes) * 100) / 100
      if (balances.pending < amountKes) fail(409, 'PENDING_BALANCE_MISMATCH', 'The seller pending balance does not cover this settlement.')
      const stamp = now()
      if (amountKes > 0) await tx.query(`INSERT INTO wallet_ledger(user_id,entry_type,bucket,amount_kes,reference_type,reference_id,actor_user_id,created_at)
        VALUES($1,'sale_settled','pending',$2,'seller_settlement',$3,$4,$5),($1,'settlement_available','available',$6,'seller_settlement',$3,$4,$5)`, [settlement.seller_user_id, -amountKes, settlement.id, auth.user.id, stamp, amountKes])
      await tx.query(`UPDATE seller_settlements SET status='settled',settled_by=$1,settled_at=$2 WHERE id=$3`, [auth.user.id, stamp, settlement.id])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES($1,$2,'admin.marketplace_settlement_approved',$3,$4::jsonb,$5)`, [randomUUID(), auth.user.id, settlement.seller_user_id, JSON.stringify({ settlementId: settlement.id, amountKes }), stamp])
      return { id: settlement.id, sellerUserId: settlement.seller_user_id, amountKes, status: 'settled', settledAt: stamp }
    })
    return sendJson(response, 200, { settlement: settled, message: 'Settlement approved and moved into the teacher’s available wallet balance. No external payment was sent.' })
  }

  if (method === 'GET' && path === '/api/admin/teacher-payouts') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = url.searchParams.get('status') || 'pending'
    if (!['pending', 'approved', 'rejected', 'paid', 'all'].includes(status)) fail(400, 'PAYOUT_STATUS_INVALID', 'Choose a valid payout status.')
    const payouts = await prepare(`SELECT p.id,p.teacher_user_id AS "teacherUserId",u.full_name AS "teacherName",u.email AS "teacherEmail",
      p.amount_kes AS "amountKes",p.destination_phone AS "destinationPhone",p.status,p.request_note AS "requestNote",p.review_note AS "reviewNote",
      p.requested_at AS "requestedAt",p.reviewed_at AS "reviewedAt",p.paid_at AS "paidAt"
      FROM teacher_payout_requests p JOIN users u ON u.id=p.teacher_user_id WHERE (?='all' OR p.status=?)
      ORDER BY p.requested_at DESC LIMIT 300`).all(status, status)
    return sendJson(response, 200, { payouts, simulatedOnly: true })
  }

  const payoutReviewMatch = path.match(/^\/api\/admin\/teacher-payouts\/([0-9a-f-]+)\/review$/i)
  if (method === 'PATCH' && payoutReviewMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = payload.status
    const reviewNote = typeof payload.reviewNote === 'string' ? payload.reviewNote.trim().slice(0, 1000) : ''
    if (!['approved', 'rejected'].includes(status)) fail(400, 'PAYOUT_DECISION_INVALID', 'Choose approve or reject for this payout request.')
    if (status === 'rejected' && reviewNote.length < 10) fail(400, 'PAYOUT_REJECTION_NOTE_REQUIRED', 'Explain the rejection in at least 10 characters.')
    const reviewed = await db.transaction(async (tx) => {
      const payout = await tx.one(`SELECT * FROM teacher_payout_requests WHERE id=$1 FOR UPDATE`, [payoutReviewMatch[1]])
      if (!payout || payout.status !== 'pending') fail(404, 'PENDING_PAYOUT_NOT_FOUND', 'That payout request is not waiting for review.')
      const stamp = now()
      if (status === 'rejected') {
        await ensureWalletAccount(tx, payout.teacher_user_id)
        const amountKes = Math.round(Number(payout.amount_kes) * 100) / 100
        await tx.query(`INSERT INTO wallet_ledger(user_id,entry_type,bucket,amount_kes,reference_type,reference_id,actor_user_id,created_at)
          VALUES($1,'payout_released','reserved',$2,'payout_request',$3,$4,$5),($1,'payout_released','available',$6,'payout_request',$3,$4,$5)`, [payout.teacher_user_id, -amountKes, payout.id, auth.user.id, stamp, amountKes])
      }
      await tx.query(`UPDATE teacher_payout_requests SET status=$1,review_note=$2,reviewed_by=$3,reviewed_at=$4 WHERE id=$5`, [status, reviewNote || null, auth.user.id, stamp, payout.id])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [randomUUID(), auth.user.id, `admin.teacher_payout_${status}`, payout.teacher_user_id, JSON.stringify({ payoutId: payout.id, amountKes: payout.amount_kes, reviewNote: reviewNote || null }), stamp])
      return { id: payout.id, teacherUserId: payout.teacher_user_id, amountKes: payout.amount_kes, status, reviewNote: reviewNote || null, reviewedAt: stamp }
    })
    return sendJson(response, 200, { payout: reviewed, message: status === 'approved' ? 'Payout approved. An administrator can record the simulated disbursement after processing.' : 'Payout rejected and reserved funds returned to the teacher’s available wallet.' })
  }

  const payoutPaidMatch = path.match(/^\/api\/admin\/teacher-payouts\/([0-9a-f-]+)\/mark-paid$/i)
  if (method === 'POST' && payoutPaidMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const paidAt = now()
    const payout = await db.transaction(async (tx) => {
      const current = await tx.one(`SELECT * FROM teacher_payout_requests WHERE id=$1 FOR UPDATE`, [payoutPaidMatch[1]])
      if (!current || current.status !== 'approved') fail(409, 'APPROVED_PAYOUT_REQUIRED', 'Only an approved payout can be marked processed.')
      await ensureWalletAccount(tx, current.teacher_user_id)
      const amountKes = Math.round(Number(current.amount_kes) * 100) / 100
      await tx.query(`INSERT INTO wallet_ledger(user_id,entry_type,bucket,amount_kes,reference_type,reference_id,actor_user_id,created_at)
        VALUES($1,'payout_paid','reserved',$2,'payout_request',$3,$4,$5),($1,'payout_paid','paid',$6,'payout_request',$3,$4,$5)`, [current.teacher_user_id, -amountKes, current.id, auth.user.id, paidAt, amountKes])
      await tx.query(`UPDATE teacher_payout_requests SET status='paid',paid_by=$1,paid_at=$2 WHERE id=$3`, [auth.user.id, paidAt, current.id])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,subject_user_id,details_json,created_at) VALUES($1,$2,'admin.teacher_payout_marked_paid',$3,$4::jsonb,$5)`, [randomUUID(), auth.user.id, current.teacher_user_id, JSON.stringify({ payoutId: current.id, amountKes, simulated: true }), paidAt])
      return { id: current.id, teacherUserId: current.teacher_user_id, amountKes, status: 'paid', paidAt, simulated: true }
    })
    return sendJson(response, 200, { payout, message: 'Demo payout marked processed. No M-PESA transfer or other money movement was initiated.' })
  }

  const marketplaceReviewMatch = path.match(/^\/api\/admin\/marketplace-submissions\/([0-9a-f-]+)\/review$/i)
  if (method === 'PATCH' && marketplaceReviewMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = payload.status
    const reviewNote = typeof payload.reviewNote === 'string' ? payload.reviewNote.trim().slice(0, 1500) : ''
    if (!['approved', 'changes_requested', 'rejected'].includes(status)) fail(400, 'REVIEW_DECISION_INVALID', 'Choose approve, request changes or reject.')
    if (status !== 'approved' && reviewNote.length < 10) fail(400, 'REVIEW_NOTE_REQUIRED', 'Add at least 10 characters explaining the requested changes or rejection.')
    if (status === 'approved') {
      const candidate = await db.one(`SELECT product_type AS "productType",included_subjects AS "includedSubjects",curriculum,grade,file_storage_key AS "fileStorageKey"
        FROM marketplace_submissions WHERE id=$1 AND status='submitted'`, [marketplaceReviewMatch[1]])
      if (!candidate) fail(404, 'PENDING_SUBMISSION_NOT_FOUND', 'That marketplace submission is not waiting for review.')
      if (!candidate.fileStorageKey) fail(400, 'PRINT_MASTER_REQUIRED', 'A real PDF or ZIP print master must be uploaded before approval.')
      await assertCompleteMarketplaceSeries(candidate)
    }
    const reviewedAt = now()
    const reviewed = await prepare(`UPDATE marketplace_submissions SET status=?,review_note=?,reviewed_by=?,reviewed_at=?,
      published_at=CASE WHEN ?='approved' THEN CAST(? AS timestamptz) ELSE NULL END,updated_at=?
      WHERE id=? AND status='submitted'
      RETURNING id,title,teacher_user_id AS "teacherUserId",status,review_note AS "reviewNote",reviewed_at AS "reviewedAt",published_at AS "publishedAt"`).get(
      status, reviewNote || null, auth.user.id, reviewedAt, status, reviewedAt, reviewedAt, marketplaceReviewMatch[1])
    if (!reviewed) fail(404, 'PENDING_SUBMISSION_NOT_FOUND', 'That marketplace submission is not waiting for review.')
    await audit(`admin.marketplace_submission_${status}`, reviewed.teacherUserId, auth.user.id, { submissionId: reviewed.id, reviewNote: reviewNote || null })
    return sendJson(response, 200, { submission: reviewed, message: status === 'approved' ? 'Resource approved and published in the marketplace.' : status === 'changes_requested' ? 'Changes requested. The resource remains private.' : 'Resource rejected and kept out of the marketplace.' })
  }

  if (method === 'GET' && path === '/api/admin/institutions') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const institutions = await prepare(`SELECT id,name,institution_type AS "institutionType",registration_number AS "registrationNumber",county,town,contact_email AS "contactEmail",
      contact_phone AS "contactPhone",status,created_at AS "createdAt" FROM institutions ORDER BY created_at DESC LIMIT 500`).all()
    return sendJson(response, 200, { institutions })
  }

  if (method === 'GET' && path === '/api/admin/institution-applications') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = url.searchParams.get('status') || 'pending'
    if (!['pending', 'approved', 'rejected'].includes(status)) fail(400, 'INSTITUTION_APPLICATION_STATUS_INVALID', 'Choose a valid application status.')
    const applications = await prepare(`SELECT a.id,a.institution_name AS "institutionName",a.institution_type AS "institutionType",a.registration_number AS "registrationNumber",
      a.county,a.town,a.physical_address AS "physicalAddress",a.contact_name AS "contactName",a.contact_role AS "contactRole",a.contact_email AS "contactEmail",
      a.contact_phone AS "contactPhone",a.notes,a.status,a.institution_id AS "institutionId",a.review_note AS "reviewNote",a.reviewed_at AS "reviewedAt",a.created_at AS "createdAt"
      FROM institution_applications a WHERE a.status=? ORDER BY a.created_at DESC LIMIT 250`).all(status)
    return sendJson(response, 200, { applications })
  }

  const institutionApplicationReviewMatch = path.match(/^\/api\/admin\/institution-applications\/([0-9a-f-]+)\/review$/i)
  if (method === 'PATCH' && institutionApplicationReviewMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = payload.status
    const reviewNote = typeof payload.reviewNote === 'string' ? payload.reviewNote.trim().slice(0, 1500) : ''
    if (!['approved', 'rejected'].includes(status)) fail(400, 'INSTITUTION_APPLICATION_DECISION_INVALID', 'Choose approve or reject.')
    if (status === 'rejected' && reviewNote.length < 10) fail(400, 'INSTITUTION_APPLICATION_NOTE_REQUIRED', 'Add at least 10 characters explaining why the application was rejected.')
    const reviewedAt = now()
    const result = await db.transaction(async (tx) => {
      const application = await tx.one('SELECT * FROM institution_applications WHERE id=$1 FOR UPDATE', [institutionApplicationReviewMatch[1]])
      if (!application || application.status !== 'pending') fail(404, 'PENDING_INSTITUTION_APPLICATION_NOT_FOUND', 'That application is not waiting for review.')
      let institutionId = null
      if (status === 'approved') {
        const institution = await tx.one(`INSERT INTO institutions(name,institution_type,registration_number,county,town,physical_address,contact_name,contact_role,contact_email,contact_phone,status,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)
          RETURNING id,name,institution_type AS "institutionType",registration_number AS "registrationNumber",county,town,contact_email AS "contactEmail",contact_phone AS "contactPhone",status`,
        [application.institution_name, application.institution_type, application.registration_number, application.county, application.town, application.physical_address, application.contact_name, application.contact_role, application.contact_email, application.contact_phone, auth.user.id])
        institutionId = institution.id
      }
      const reviewed = await tx.one(`UPDATE institution_applications SET status=$1,institution_id=$2,review_note=$3,reviewed_by=$4,reviewed_at=$5 WHERE id=$6
        RETURNING id,institution_name AS "institutionName",status,institution_id AS "institutionId",review_note AS "reviewNote",reviewed_at AS "reviewedAt"`,
      [status, institutionId, reviewNote || null, auth.user.id, reviewedAt, application.id])
      await tx.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,$3,$4::jsonb,$5)`,
        [randomUUID(), auth.user.id, `admin.institution_application_${status}`, JSON.stringify({ applicationId: application.id, institutionId, registrationNumber: application.registration_number }), reviewedAt])
      return reviewed
    })
    return sendJson(response, 200, { application: result, message: status === 'approved' ? 'Institution approved and added to the directory. Invite the representative as School admin to finish account setup.' : 'Institution application rejected.' })
  }

  if (method === 'POST' && path === '/api/admin/institutions') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ') : ''
    const institutionType = ['school', 'college', 'publisher', 'other'].includes(payload.institutionType) ? payload.institutionType : 'school'
    const county = typeof payload.county === 'string' && payload.county.trim() ? payload.county.trim().slice(0, 100) : null
    const contactEmail = normalizeEmail(payload.contactEmail)
    const contactPhone = normalizePhone(payload.contactPhone)
    if (name.length < 2 || name.length > 180) fail(400, 'INSTITUTION_NAME_INVALID', 'Enter an institution name between 2 and 180 characters.')
    if (contactEmail && !emailPattern.test(contactEmail)) fail(400, 'INSTITUTION_EMAIL_INVALID', 'Enter a valid institution email address.')
    if (contactPhone && !phonePattern.test(contactPhone)) fail(400, 'INSTITUTION_PHONE_INVALID', 'Enter a valid international phone number.')
    const institution = await prepare(`INSERT INTO institutions(name,institution_type,county,contact_email,contact_phone,created_by)
      VALUES(?,?,?,?,?,?) RETURNING id,name,institution_type AS "institutionType",county,contact_email AS "contactEmail",
      contact_phone AS "contactPhone",status,created_at AS "createdAt"`).get(name, institutionType, county, contactEmail, contactPhone, auth.user.id)
    await audit('admin.institution_created', null, auth.user.id, { institutionId: institution.id, institutionType })
    return sendJson(response, 201, { institution })
  }

  if (method === 'GET' && path === '/api/admin/parent-links') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = url.searchParams.get('status') || 'pending'
    if (!['pending', 'approved', 'rejected', 'revoked'].includes(status)) fail(400, 'LINK_STATUS_INVALID', 'Choose a valid link status.')
    const links = await prepare(`SELECT l.id,l.relationship,l.status,l.requested_at AS "requestedAt",l.reviewed_at AS "reviewedAt",l.review_note AS "reviewNote",
      p.id AS "parentId",p.full_name AS "parentName",p.email AS "parentEmail",p.phone AS "parentPhone",
      s.id AS "learnerId",s.full_name AS "learnerName",s.email AS "learnerEmail",s.phone AS "learnerPhone"
      FROM parent_learner_links l JOIN users p ON p.id=l.parent_user_id JOIN users s ON s.id=l.learner_user_id
      WHERE l.status=? ORDER BY l.requested_at DESC LIMIT 250`).all(status)
    return sendJson(response, 200, { links })
  }

  const parentLinkReviewMatch = path.match(/^\/api\/admin\/parent-links\/([0-9a-f-]+)$/i)
  if (method === 'PATCH' && parentLinkReviewMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const status = payload.status
    if (!['approved', 'rejected'].includes(status)) fail(400, 'LINK_DECISION_INVALID', 'Choose approve or reject for a parent link.')
    const reviewNote = typeof payload.reviewNote === 'string' && payload.reviewNote.trim() ? payload.reviewNote.trim().slice(0, 500) : null
    const link = await prepare(`UPDATE parent_learner_links SET status=?,reviewed_by=?,reviewed_at=?,review_note=?
      WHERE id=? AND status='pending' RETURNING id,parent_user_id AS "parentUserId",learner_user_id AS "learnerUserId",status`).get(status, auth.user.id, now(), reviewNote, parentLinkReviewMatch[1])
    if (!link) fail(404, 'PENDING_LINK_NOT_FOUND', 'That parent link is not pending review.')
    await audit(`admin.parent_learner_link_${status}`, link.learnerUserId, auth.user.id, { linkId: link.id, parentUserId: link.parentUserId, reviewNote })
    return sendJson(response, 200, { link, message: status === 'approved' ? 'Parent link approved.' : 'Parent link rejected.' })
  }

  if (method === 'GET' && path === '/api/parent/learners') {
    const auth = await getAuth(request)
    requireRole(auth, ['Parent'])
    const learners = await prepare(`SELECT l.id AS "linkId",l.relationship,u.id,u.full_name AS "fullName",u.email,u.phone
      FROM parent_learner_links l JOIN users u ON u.id=l.learner_user_id
      WHERE l.parent_user_id=? AND l.status='approved' ORDER BY u.full_name`).all(auth.user.id)
    return sendJson(response, 200, { learners })
  }

  if (method === 'POST' && path === '/api/parent/links') {
    const auth = await getAuth(request)
    requireRole(auth, ['Parent'])
    const learner = await findUser(payload.learnerIdentifier)
    if (!learner || learner.status !== 'active' || !(await q.role.get(learner.id, 'Learner', null))) fail(404, 'LEARNER_NOT_FOUND', 'No active learner account matches that email or phone number.')
    if (learner.id === auth.user.id) fail(400, 'SELF_LINK_NOT_ALLOWED', 'You cannot link your account to itself.')
    const relationship = ['parent', 'guardian', 'other'].includes(payload.relationship) ? payload.relationship : 'parent'
    const link = await prepare(`INSERT INTO parent_learner_links(parent_user_id,learner_user_id,relationship,status,requested_at)
      VALUES(?,?,?,'pending',?) ON CONFLICT(parent_user_id,learner_user_id) DO UPDATE SET relationship=EXCLUDED.relationship,
      status='pending',requested_at=EXCLUDED.requested_at,reviewed_by=NULL,reviewed_at=NULL,review_note=NULL
      WHERE parent_learner_links.status IN ('rejected','revoked')
      RETURNING id,relationship,status,requested_at AS "requestedAt"`).get(auth.user.id, learner.id, relationship, now())
    if (!link) fail(409, 'LINK_ALREADY_EXISTS', 'A link request already exists for this learner.')
    await audit('parent.learner_link_requested', learner.id, auth.user.id, { linkId: link.id, relationship })
    return sendJson(response, 201, { link, message: 'Request submitted for administrator review. Learner information remains private until approval.' })
  }

  if (method === 'POST' && path === '/api/admin/invitations') {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const role = payload.role
    const email = normalizeEmail(payload.email)
    const phone = normalizePhone(payload.phone)
    const destination = email || phone
    const institutionId = typeof payload.institutionId === 'string' && payload.institutionId.trim() ? payload.institutionId.trim() : null
    if (!roles.includes(role)) fail(400, 'ROLE_INVALID', 'Choose one of the supported roles.')
    if (!destination || (email && !emailPattern.test(email)) || (phone && !phonePattern.test(phone))) fail(400, 'CONTACT_INVALID', 'Enter a valid email address or international phone number.')
    if (['Teacher', 'School admin', 'Examiner'].includes(role) && !institutionId) fail(400, 'INSTITUTION_REQUIRED', `${role} invitations need an institution ID.`)
    if (institutionId && !await prepare(`SELECT 1 AS found FROM institutions WHERE id=? AND status='active'`).get(institutionId)) fail(400, 'INSTITUTION_NOT_FOUND', 'Choose an active institution before sending this invitation.')
    if (role === 'Platform admin' && institutionId) fail(400, 'INSTITUTION_NOT_ALLOWED', 'Platform admin access is global, not institution-scoped.')
    const token = randomBytes(32).toString('base64url')
    const id = randomUUID()
    const timestamp = now()
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    await prepare(`INSERT INTO role_invitations(id,destination,role,institution_id,token_hash,invited_by,expires_at,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(id, destination, role, institutionId, hashToken(token), auth.user.id, expiresAt, timestamp)
    await audit('admin.role_invitation_created', null, auth.user.id, { role, institutionId, invitationId: id })
    return sendJson(response, 201, { invitationId: id, invitationToken: token, destination, role, institutionId, expiresAt })
  }

  const grantMatch = path.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/roles$/i)
  if (method === 'POST' && grantMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const userId = grantMatch[1]
    const target = await q.userById.get(userId)
    if (!target) fail(404, 'USER_NOT_FOUND', 'That account was not found.')
    const role = payload.role
    const institutionId = typeof payload.institutionId === 'string' && payload.institutionId.trim() ? payload.institutionId.trim() : null
    if (!roles.includes(role)) fail(400, 'ROLE_INVALID', 'Choose one of the supported roles.')
    if (['Teacher', 'School admin', 'Examiner'].includes(role) && !institutionId) fail(400, 'INSTITUTION_REQUIRED', `${role} access needs an institution ID.`)
    if (institutionId && !await prepare(`SELECT 1 AS found FROM institutions WHERE id=? AND status='active'`).get(institutionId)) fail(400, 'INSTITUTION_NOT_FOUND', 'Choose an active institution before assigning this role.')
    if (role === 'Platform admin' && institutionId) fail(400, 'INSTITUTION_NOT_ALLOWED', 'Platform admin access is global, not institution-scoped.')
    await prepare('INSERT INTO user_roles(id,user_id,role,institution_id,granted_by,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(randomUUID(), userId, role, institutionId, auth.user.id, now())
    await audit('admin.role_granted', userId, auth.user.id, { role, institutionId })
    return sendJson(response, 200, { user: await safeUser(await q.userById.get(userId)), message: 'Role assigned.' })
  }

  const revokeMatch = path.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/roles\/([a-z-]+)$/i)
  if (method === 'DELETE' && revokeMatch) {
    const auth = await getAuth(request)
    requireRole(auth, ['Platform admin'])
    const userId = revokeMatch[1]
    const role = roles.find((item) => item.toLowerCase().replaceAll(' ', '-') === revokeMatch[2].toLowerCase())
    const institutionId = url.searchParams.get('institutionId')
    if (!role || !await q.userById.get(userId)) fail(404, 'ROLE_MEMBERSHIP_NOT_FOUND', 'That role assignment was not found.')
    if (auth.user.id === userId && role === 'Platform admin') fail(409, 'LAST_ADMIN_PROTECTION', 'You cannot remove your own platform admin access.')
    if (role === 'Platform admin' && Number((await prepare(`SELECT COUNT(*) AS count FROM user_roles WHERE role='Platform admin' AND institution_id IS NULL`).get()).count) <= 1) fail(409, 'LAST_ADMIN_PROTECTION', 'At least one Platform admin account must remain assigned.')
    await prepare('DELETE FROM user_roles WHERE user_id=? AND role=? AND institution_id IS ?').run(userId, role, institutionId)
    await prepare('DELETE FROM sessions WHERE user_id=? AND active_role=? AND institution_id IS ?').run(userId, role, institutionId)
    await audit('admin.role_revoked', userId, auth.user.id, { role, institutionId })
    return sendJson(response, 200, { user: await safeUser(await q.userById.get(userId)), message: 'Role removed; sessions using it were revoked.' })
  }

  fail(404, 'ROUTE_NOT_FOUND', 'No API route matches this request.')
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (origin === webOrigin) {
    response.setHeader('Access-Control-Allow-Origin', webOrigin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end() }
  try { await router(request, response) }
  catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error(error)
    sendJson(response, status, { error: { code: error.code || 'INTERNAL_ERROR', message: status >= 500 ? 'The server could not complete this request.' : error.message, ...(error.details ? { details: error.details } : {}) } })
  }
})

const port = Number(process.env.API_PORT || 8787)
const host = process.env.API_HOST || '127.0.0.1'
server.listen(port, host, () => console.info(`Guardian Exams auth API listening at http://${host}:${port} (PostgreSQL)`))
server.on('close', () => { void db.end() })

async function loadEnv(path) {
  try {
    const content = await readFile(path, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match || Object.hasOwn(process.env, match[1])) continue
      let value = match[2]
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      process.env[match[1]] = value
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
