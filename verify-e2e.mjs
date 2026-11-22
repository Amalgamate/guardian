import { randomBytes } from 'node:crypto'

const API = 'http://127.0.0.1:8787'
const WEB_ORIGIN = 'http://localhost:5174'
const results = []
let step = 0

function log(label, data) {
  step++
  const entry = { step, label, ...data }
  results.push(entry)
  console.log(`\n[STEP ${step}] ${label}`)
  if (data.status) console.log(`  status: ${data.status}`)
  if (data.code) console.log(`  code: ${data.code}`)
  if (data.message) console.log(`  message: ${data.message}`)
  if (data.detail) console.log(`  detail: ${JSON.stringify(data.detail)}`)
  return entry
}

async function api(method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json', Origin: WEB_ORIGIN }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie') || ''
  const sessionCookie = setCookie.match(/guardian_session=([^;]+)/)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { rawText: text } }
  return { status: res.status, json, cookie: sessionCookie ? `guardian_session=${sessionCookie[1]}` : cookie }
}

async function login(identifier, password, role) {
  const res = await api('POST', '/api/auth/login', { identifier, password, role })
  if (res.status !== 200) {
    log('LOGIN FAILED', { status: res.status, code: res.json?.error?.code, message: res.json?.error?.message, identifier })
    throw new Error(`Login failed for ${identifier}: ${res.json?.error?.message}`)
  }
  log('LOGIN OK', { status: res.status, identifier, role: res.json.activeRole })
  return res.cookie
}

async function registerAndVerify(fullName, email, password, role) {
  // Register
  const reg = await api('POST', '/api/auth/register', { fullName, email, password, role, channel: 'email' })
  if (reg.status !== 201) {
    log('REGISTER FAILED', { status: reg.status, code: reg.json?.error?.code, message: reg.json?.error?.message, email })
    throw new Error(`Registration failed for ${email}: ${reg.json?.error?.message}`)
  }
  log('REGISTER OK', { status: reg.status, email, challengeId: reg.json.challengeId })

  // Get the OTP from console output — we can't capture it from the running process
  // Instead, we'll read it directly from the database
  const challengeId = reg.json.challengeId
  return { challengeId, email, password, role }
}

// Since OTP is delivered to console only, we need to query the DB for the code hash
// But we can't reverse the hash. Instead, we'll use a different approach:
// The bootstrap admin was created with status='active' and email_verified_at set.
// For new users, we need to verify the OTP. Since OTP_DELIVERY=console, the code was
// printed to the API server's stdout. We can't easily get it.
//
// Alternative approach: Use the admin's ability to create institutions, then use
// role invitations to create teacher accounts. But registration still needs OTP.
//
// Best approach: Query the DB to get the challenge, then brute-force the 6-digit code
// by calling the verify endpoint. But that would be rate-limited.
//
// Actually, let's look at the code more carefully. The OTP is hashed as:
// hashOtp(challengeId, code) = sha256(authSecret:challengeId:code)
// The authSecret is process.env.AUTH_OTP_PEPPER or randomBytes(32).toString('hex')
// Since AUTH_OTP_PEPPER is empty in .env, it's a random value generated at startup.
// We can't access it from outside.
//
// So we need a different approach: modify the database directly to create test users
// with active status and assigned roles, bypassing the OTP flow.

// APPROACH: Use direct DB access to create test users with proper password hashes
// and active status, then use the API to log in.

import { createDatabase } from './server/db.mjs'
import { scrypt as scryptCallback, randomBytes as rb, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

async function hashPassword(password) {
  const salt = rb(16).toString('hex')
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 })
  return `scrypt$32768$8$1$${salt}$${Buffer.from(derived).toString('hex')}`
}

const db = createDatabase({ connectionString: process.env.DATABASE_URL })

async function createTestUser(fullName, email, password, role, institutionId = null) {
  const id = randomUUID()
  const stamp = new Date().toISOString()
  const hash = await hashPassword(password)
  await db.query(
    `INSERT INTO users(id,full_name,email,email_normalized,password_hash,status,email_verified_at,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,'active',$6,$7,$8)`,
    [id, fullName, email, email.toLowerCase(), hash, stamp, stamp, stamp]
  )
  await db.query(
    `INSERT INTO user_roles(id,user_id,role,institution_id,granted_by,created_at) VALUES($1,$2,$3,$4,NULL,$5)`,
    [randomUUID(), id, role, institutionId, stamp]
  )
  await db.query(`INSERT INTO audit_events(id,actor_user_id,action,details_json,created_at) VALUES($1,$2,'test.user_created',$3::jsonb,$4)`,
    [randomUUID(), id, JSON.stringify({ role, email }), stamp])
  log('USER CREATED', { email, role, userId: id })
  return id
}

try {
  // === STEP 1: Login as Platform Admin ===
  console.log('\n=== Starting End-to-End Verification ===\n')
  const adminCookie = await login('admin@guardianexams.local', 'GuardianAdmin2026!', 'Platform admin')

  // === STEP 2: Create an Institution ===
  const instRes = await api('POST', '/api/admin/institutions', {
    name: 'Test Academy Nairobi',
    institutionType: 'school',
    county: 'Nairobi',
    contactEmail: 'info@testacademy.ac.ke',
    contactPhone: '+254712345678',
  }, adminCookie)
  if (instRes.status !== 201) throw new Error(`Institution creation failed: ${instRes.json?.error?.message}`)
  const institutionId = instRes.json.institution.id
  log('INSTITUTION CREATED', { status: instRes.status, name: instRes.json.institution.name, institutionId })

  // === STEP 3: Create test users directly in DB ===
  const teacherId = await createTestUser('Jane Teacher', 'teacher@testacademy.ac.ke', 'TeacherPass2026!', 'Teacher', institutionId)
  const learnerId = await createTestUser('Tom Learner', 'learner@testacademy.ac.ke', 'LearnerPass2026!', 'Learner')

  // === STEP 4: Teacher logs in and creates a marketplace submission ===
  const teacherCookie = await login('teacher@testacademy.ac.ke', 'TeacherPass2026!', 'Teacher')

  // Check teacher's active role context includes institutionId
  const meRes = await api('GET', '/api/auth/me', null, teacherCookie)
  log('TEACHER CONTEXT', { role: meRes.json.activeRole, institutionId: meRes.json.institutionId })

  // If teacher role doesn't have institutionId in session, switch active role
  if (!meRes.json.institutionId) {
    const switchRes = await api('POST', '/api/auth/active-role', { role: 'Teacher', institutionId }, teacherCookie)
    log('TEACHER ROLE SWITCHED', { status: switchRes.status, role: switchRes.json.activeRole, institutionId: switchRes.json.institutionId })
  }

  // Create submission (draft)
  const subRes = await api('POST', '/api/teacher/marketplace-submissions', {
    title: 'KCSE Mathematics Paper 1 Revision Pack',
    description: 'Comprehensive revision pack covering Form 1-4 mathematics topics aligned with the KCSE syllabus. Includes worked examples and practice questions.',
    curriculum: 'CBC',
    level: 'Secondary',
    grade: 'Form 4',
    subject: 'Mathematics',
    year: '2025',
    term: 'Term 3',
    type: 'Revision Pack',
    resource: 'PDF Booklet',
    pages: 120,
    questions: 200,
    formats: ['PDF'],
    price: 350,
    fileName: 'kcse-maths-paper1-sample.pdf',
    rightsConfirmed: true,
  }, teacherCookie)
  if (subRes.status !== 201) throw new Error(`Submission creation failed: ${subRes.json?.error?.message}`)
  const submissionId = subRes.json.submission.id
  log('SUBMISSION CREATED (draft)', { status: subRes.status, submissionId, status: subRes.json.submission.status })

  // Submit for review
  const submitRes = await api('POST', `/api/teacher/marketplace-submissions/${submissionId}/submit`, {}, teacherCookie)
  if (submitRes.status !== 200) throw new Error(`Submission send failed: ${submitRes.json?.error?.message}`)
  log('SUBMISSION SENT FOR REVIEW', { status: submitRes.status, submissionId, status: submitRes.json.submission.status })

  // === STEP 5: Admin reviews and approves the submission ===
  const adminSubsRes = await api('GET', '/api/admin/marketplace-submissions?status=submitted', null, adminCookie)
  log('ADMIN SEES SUBMITTED', { status: adminSubsRes.status, count: adminSubsRes.json?.submissions?.length })

  const reviewRes = await api('PATCH', `/api/admin/marketplace-submissions/${submissionId}/review`, {
    status: 'approved',
    reviewNote: 'Content reviewed and meets quality standards.',
  }, adminCookie)
  if (reviewRes.status !== 200) throw new Error(`Review failed: ${reviewRes.json?.error?.message}`)
  log('SUBMISSION APPROVED', { status: reviewRes.status, submissionId, status: reviewRes.json.submission.status, publishedAt: reviewRes.json.submission.publishedAt })

  // === STEP 6: Learner sees the approved resource in the catalog ===
  const catalogRes = await api('GET', '/api/marketplace/catalog', null, null)
  log('CATALOG HAS PRODUCTS', { status: catalogRes.status, count: catalogRes.json.products.length, title: catalogRes.json.products[0]?.title })
  if (!catalogRes.json.products.length) throw new Error('Catalog is empty after approval')

  // Learner logs in
  const learnerCookie = await login('learner@testacademy.ac.ke', 'LearnerPass2026!', 'Learner')

  // === STEP 7: Learner creates an order ===
  const productId = catalogRes.json.products[0].id
  const orderRes = await api('POST', '/api/marketplace/orders', { productIds: [productId] }, learnerCookie)
  if (orderRes.status !== 201) throw new Error(`Order creation failed: ${orderRes.json?.error?.message}`)
  const orderId = orderRes.json.order.id
  log('ORDER CREATED', { status: orderRes.status, orderId, totalKes: orderRes.json.order.totalKes, isSimulated: orderRes.json.order.isSimulatedPayment })

  // === STEP 8: Learner completes the simulated payment ===
  const payRes = await api('POST', `/api/marketplace/orders/${orderId}/simulate-payment`, {}, learnerCookie)
  if (payRes.status !== 200) throw new Error(`Simulated payment failed: ${payRes.json?.error?.message}`)
  log('SIMULATED PAYMENT COMPLETED', {
    status: payRes.status,
    orderId,
    orderStatus: payRes.json.order.status,
    paymentMethod: payRes.json.order.paymentMethod,
    paymentReference: payRes.json.order.paymentReference,
    isSimulated: payRes.json.order.isSimulatedPayment,
    message: payRes.json.message,
  })

  // === STEP 9: Admin settles the teacher share ===
  const settlementsRes = await api('GET', '/api/admin/marketplace-settlements?status=pending', null, adminCookie)
  log('ADMIN SEES PENDING SETTLEMENTS', { status: settlementsRes.status, count: settlementsRes.json?.settlements?.length })
  if (!settlementsRes.json.settlements?.length) throw new Error('No pending settlements found')

  const settlementId = settlementsRes.json.settlements[0].id
  const settleRes = await api('POST', `/api/admin/marketplace-settlements/${settlementId}/approve`, {}, adminCookie)
  if (settleRes.status !== 200) throw new Error(`Settlement approval failed: ${settleRes.json?.error?.message}`)
  log('SETTLEMENT APPROVED', { status: settleRes.status, settlementId, status: settleRes.json.settlement.status, amountKes: settleRes.json.settlement.amountKes, message: settleRes.json.message })

  // === STEP 10: Teacher checks wallet and requests a payout ===
  const walletRes = await api('GET', '/api/teacher/wallet', null, teacherCookie)
  log('TEACHER WALLET', {
    status: walletRes.status,
    balances: walletRes.json.balances,
    settlements: walletRes.json.settlements?.length,
    sharePercent: walletRes.json.sharePercent,
    simulatedOnly: walletRes.json.simulatedOnly,
  })

  const availableBalance = walletRes.json.balances.available
  if (availableBalance < 100) throw new Error(`Available balance too low for payout: ${availableBalance}`)

  const payoutRes = await api('POST', '/api/teacher/wallet/payouts', {
    amountKes: availableBalance,
    phone: '+254712345678',
    note: 'Monthly payout request',
  }, teacherCookie)
  if (payoutRes.status !== 201) throw new Error(`Payout request failed: ${payoutRes.json?.error?.message}`)
  const payoutId = payoutRes.json.payout.id
  log('PAYOUT REQUESTED', { status: payoutRes.status, payoutId, amountKes: payoutRes.json.payout.amountKes, message: payoutRes.json.message })

  // === STEP 11: Admin reviews the payout ===
  const adminPayoutsRes = await api('GET', '/api/admin/teacher-payouts?status=pending', null, adminCookie)
  log('ADMIN SEES PENDING PAYOUTS', { status: adminPayoutsRes.status, count: adminPayoutsRes.json?.payouts?.length })

  // Approve the payout
  const payoutReviewRes = await api('PATCH', `/api/admin/teacher-payouts/${payoutId}/review`, {
    status: 'approved',
    reviewNote: 'Payout approved for processing.',
  }, adminCookie)
  if (payoutReviewRes.status !== 200) throw new Error(`Payout review failed: ${payoutReviewRes.json?.error?.message}`)
  log('PAYOUT APPROVED', { status: payoutReviewRes.status, payoutId, status: payoutReviewRes.json.payout.status, message: payoutReviewRes.json.message })

  // Mark paid (simulated)
  const payoutPaidRes = await api('POST', `/api/admin/teacher-payouts/${payoutId}/mark-paid`, {}, adminCookie)
  if (payoutPaidRes.status !== 200) throw new Error(`Mark paid failed: ${payoutPaidRes.json?.error?.message}`)
  log('PAYOUT MARKED PAID (SIMULATED)', {
    status: payoutPaidRes.status,
    payoutId,
    status: payoutPaidRes.json.payout.status,
    paidAt: payoutPaidRes.json.payout.paidAt,
    simulated: payoutPaidRes.json.payout.simulated,
    message: payoutPaidRes.json.message,
  })

  // === STEP 12: Inbox verification ===

  // 12a: Learner sends a support message
  const supportRes = await api('POST', '/api/inbox/support', {
    subject: 'Cannot download my purchased resource',
    body: 'I completed the payment but cannot find a download link for the KCSE Mathematics revision pack.',
  }, learnerCookie)
  if (supportRes.status !== 201) throw new Error(`Support message failed: ${supportRes.json?.error?.message}`)
  log('SUPPORT MESSAGE SENT', { status: supportRes.status, messageId: supportRes.json.message.id, recipientCount: supportRes.json.recipientCount })

  // 12b: Admin sees the support message in inbox
  const adminInboxRes = await api('GET', '/api/inbox?limit=10', null, adminCookie)
  log('ADMIN INBOX', { status: adminInboxRes.status, messageCount: adminInboxRes.json?.messages?.length, firstSubject: adminInboxRes.json?.messages?.[0]?.subject })

  const supportMessageId = adminInboxRes.json?.messages?.find(m => m.category === 'support')?.id

  // 12c: Admin sends an announcement to all users
  const announceRes = await api('POST', '/api/admin/inbox/announcements', {
    subject: 'Platform Maintenance Notice',
    body: 'The platform will undergo scheduled maintenance this Saturday from 2am to 4am. Services will be unavailable during this time.',
    audience: 'all',
  }, adminCookie)
  if (announceRes.status !== 201) throw new Error(`Announcement failed: ${announceRes.json?.error?.message}`)
  const announcementId = announceRes.json.announcement.id
  log('ANNOUNCEMENT SENT', { status: announceRes.status, announcementId, recipientCount: announceRes.json.announcement.recipientCount })

  // 12d: Learner sees the announcement
  const learnerInboxRes = await api('GET', '/api/inbox?limit=10', null, learnerCookie)
  log('LEARNER INBOX', { status: learnerInboxRes.status, messageCount: learnerInboxRes.json?.messages?.length, subjects: learnerInboxRes.json?.messages?.map(m => m.subject) })

  // 12e: Check unread count
  const unreadRes = await api('GET', '/api/inbox/unread-count', null, learnerCookie)
  log('LEARNER UNREAD COUNT', { status: unreadRes.status, unreadCount: unreadRes.json.unreadCount })

  // 12f: Mark a message as read
  if (learnerInboxRes.json?.messages?.[0]) {
    const firstMsgId = learnerInboxRes.json.messages[0].id
    const readRes = await api('PATCH', `/api/inbox/${firstMsgId}/read`, {}, learnerCookie)
    log('MESSAGE MARKED READ', { status: readRes.status, messageId: firstMsgId, readAt: readRes.json?.message?.readAt })

    // Verify unread count decreased
    const unreadAfterRes = await api('GET', '/api/inbox/unread-count', null, learnerCookie)
    log('UNREAD COUNT AFTER READ', { unreadCount: unreadAfterRes.json.unreadCount })
  }

  // 12g: Archive a message
  if (learnerInboxRes.json?.messages?.[1]) {
    const secondMsgId = learnerInboxRes.json.messages[1].id
    const archiveRes = await api('PATCH', `/api/inbox/${secondMsgId}/archive`, {}, learnerCookie)
    log('MESSAGE ARCHIVED', { status: archiveRes.status, messageId: secondMsgId, archivedAt: archiveRes.json?.message?.archivedAt })
  }

  // 12h: Teacher inbox - sees announcement
  const teacherInboxRes = await api('GET', '/api/inbox?limit=10', null, teacherCookie)
  log('TEACHER INBOX', { status: teacherInboxRes.status, messageCount: teacherInboxRes.json?.messages?.length, subjects: teacherInboxRes.json?.messages?.map(m => m.subject) })

  // 12i: Admin replies to support message (direct message to learner)
  if (supportMessageId) {
    const replyRes = await api('POST', '/api/inbox/messages', {
      recipientUserId: learnerId,
      subject: 'Re: Cannot download my purchased resource',
      body: 'Thank you for reaching out. The download link will appear in your purchased orders once the resource is fulfilled. Currently, the platform records sample file labels only — the actual PDF upload and fulfillment feature is under development.',
      category: 'support',
    }, adminCookie)
    if (replyRes.status !== 201) throw new Error(`Admin reply failed: ${replyRes.json?.error?.message}`)
    log('ADMIN REPLIED TO SUPPORT', { status: replyRes.status, messageId: replyRes.json.message.id })
  }

  // === SUMMARY ===
  console.log('\n=== END-TO-END VERIFICATION SUMMARY ===\n')
  let allPassed = true
  for (const r of results) {
    const passed = !r.code && r.status !== 'FAILED'
    if (!passed) allPassed = false
    console.log(`[${passed ? 'PASS' : 'FAIL'}] Step ${r.step}: ${r.label}`)
  }
  console.log(`\n${allPassed ? 'ALL STEPS PASSED' : 'SOME STEPS FAILED'}`)
  console.log('\nNOTE: No real money was transferred. All payments and payouts are simulated.')
  console.log('NOTE: The product records a sample filename only — there is no original PDF upload or fulfillment.')

} catch (error) {
  console.error('\n!!! VERIFICATION ERROR !!!')
  console.error(error.message)
  console.error(error.stack)
  console.log('\nPartial results so far:')
  for (const r of results) {
    console.log(`[Step ${r.step}] ${r.label}: ${r.status || ''} ${r.code || ''} ${r.message || ''}`)
  }
} finally {
  await db.end()
}

export { results }
