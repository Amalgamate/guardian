// Permanent deletion (purge) of platform records.
//
// A school or an account cannot be removed while money or academic records still depend on
// it. `checkUserDeletion` / `checkInstitutionDeletion` report exactly what is in the way, and
// `purgeUser` / `purgeInstitution` run the same checks again inside the transaction that
// deletes, so a concurrent order can never be orphaned between the preview and the delete.
//
// Audit history survives a purge: the rows are detached and keep a text snapshot of who acted.

const money = (value) => `KSh ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

async function countOf(tx, sql, values) {
  const row = await tx.one(sql, values)
  return row ? Number(row.count) : 0
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// ---------- users ----------

export async function checkUserDeletion(tx, userId) {
  const user = await tx.one('SELECT id,full_name AS "fullName",email,phone,status FROM users WHERE id=$1', [userId])
  if (!user) return null

  const [orders, submissions, assessments, marks, payouts, settled, pendingSettlements] = await Promise.all([
    countOf(tx, 'SELECT count(*)::int AS count FROM marketplace_orders WHERE buyer_user_id=$1', [userId]),
    countOf(tx, 'SELECT count(*)::int AS count FROM marketplace_submissions WHERE teacher_user_id=$1', [userId]),
    countOf(tx, 'SELECT count(*)::int AS count FROM assessments WHERE teacher_user_id=$1', [userId]),
    countOf(tx, `SELECT count(*)::int AS count FROM assessment_question_marks m
      JOIN assessment_attempts a ON a.id=m.attempt_id WHERE a.learner_user_id=$1`, [userId]),
    countOf(tx, `SELECT count(*)::int AS count FROM teacher_payout_requests
      WHERE teacher_user_id=$1 AND status IN ('pending','approved')`, [userId]),
    countOf(tx, `SELECT COALESCE(sum(amount_kes),0)::numeric AS count FROM seller_settlements
      WHERE seller_user_id=$1 AND status='settled'`, [userId]),
    countOf(tx, `SELECT count(*)::int AS count FROM seller_settlements
      WHERE seller_user_id=$1 AND status='pending'`, [userId]),
  ])

  const blockers = []
  if (orders > 0) blockers.push({ code: 'BUYER_HAS_ORDERS', count: orders, message: `${plural(orders, 'marketplace order')} belong to this buyer. Orders are financial records, so cancel or refund them instead of deleting the account.` })
  if (submissions > 0) blockers.push({ code: 'TEACHER_HAS_SUBMISSIONS', count: submissions, message: `${plural(submissions, 'marketplace submission')} were uploaded by this teacher. Remove the resources from the review queue first.` })
  if (assessments > 0) blockers.push({ code: 'TEACHER_HAS_ASSESSMENTS', count: assessments, message: `${plural(assessments, 'assessment')} were created by this teacher. Delete the assessments before deleting the account.` })
  if (marks > 0) blockers.push({ code: 'LEARNER_HAS_MARKED_WORK', count: marks, message: `${plural(marks, 'marked answer')} exist for this learner. Published results are academic records and are never deleted with an account.` })
  if (payouts > 0) blockers.push({ code: 'TEACHER_HAS_OPEN_PAYOUTS', count: payouts, message: `${plural(payouts, 'payout request')} are still pending or approved. Reject or pay them first.` })

  return {
    user,
    blockers,
    warnings: [
      pendingSettlements > 0 ? `${plural(pendingSettlements, 'pending seller settlement')} will be deleted with this account.` : null,
      settled > 0 ? `${money(settled)} of settled earnings will be removed from the seller ledger.` : null,
    ].filter(Boolean),
    deletable: blockers.length === 0,
  }
}

// ---------- institutions ----------

export async function checkInstitutionDeletion(tx, institutionId) {
  const institution = await tx.one('SELECT id,name,status FROM institutions WHERE id=$1', [institutionId])
  if (!institution) return null

  const [orders, assessments, submissions, members, pending, paid, applications, roles] = await Promise.all([
    countOf(tx, `SELECT count(*)::int AS count FROM marketplace_orders o
      JOIN marketplace_order_items oi ON oi.order_id=o.id
      JOIN marketplace_submissions s ON s.id=oi.submission_id WHERE s.institution_id=$1`, [institutionId]),
    countOf(tx, 'SELECT count(*)::int AS count FROM assessments WHERE institution_id=$1', [institutionId]),
    countOf(tx, 'SELECT count(*)::int AS count FROM marketplace_submissions WHERE institution_id=$1', [institutionId]),
    countOf(tx, 'SELECT count(DISTINCT user_id)::int AS count FROM user_roles WHERE institution_id=$1', [institutionId]),
    countOf(tx, `SELECT COALESCE(sum(amount_kes),0)::numeric AS count FROM seller_settlements st
      JOIN marketplace_order_items oi ON oi.id=st.order_item_id
      JOIN marketplace_submissions s ON s.id=oi.submission_id
      WHERE s.institution_id=$1 AND st.status='pending'`, [institutionId]),
    countOf(tx, `SELECT COALESCE(sum(total_kes),0)::numeric AS count FROM marketplace_orders o
      JOIN marketplace_order_items oi ON oi.order_id=o.id
      JOIN marketplace_submissions s ON s.id=oi.submission_id
      WHERE s.institution_id=$1 AND o.status='paid'`, [institutionId]),
    countOf(tx, 'SELECT count(*)::int AS count FROM institution_applications WHERE institution_id=$1', [institutionId]),
    countOf(tx, `SELECT count(*)::int AS count FROM user_roles WHERE institution_id=$1 AND role='School admin'`, [institutionId]),
  ])

  const blockers = []
  if (orders > 0) blockers.push({ code: 'INSTITUTION_HAS_ORDERS', count: orders, message: `${plural(orders, 'marketplace order')} are tied to resources sold by this school. Orders are financial records and block deletion.` })
  if (paid > 0) blockers.push({ code: 'INSTITUTION_HAS_PAID_SALES', count: paid, message: `${money(paid)} of paid sales are linked to this school. Refund or reconcile them first.` })
  if (assessments > 0) blockers.push({ code: 'INSTITUTION_HAS_ASSESSMENTS', count: assessments, message: `${plural(assessments, 'assessment')} belong to this school. Delete them before deleting the institution.` })
  if (submissions > 0) blockers.push({ code: 'INSTITUTION_HAS_SUBMISSIONS', count: submissions, message: `${plural(submissions, 'marketplace submission')} were uploaded for this school. Remove them from the review queue first.` })

  return {
    institution,
    blockers,
    warnings: [
      members > 0 ? `${plural(members, 'account')} will lose this school membership; the accounts themselves are kept.` : null,
      roles > 0 ? `${plural(roles, 'School admin role assignment')} will be removed.` : null,
      pending > 0 ? `${money(pending)} of pending seller settlements will be deleted.` : null,
      applications > 0 ? `${plural(applications, 'approved application record')} will be unlinked and kept for history.` : null,
    ].filter(Boolean),
    deletable: blockers.length === 0,
  }
}

// ---------- student activity reset ----------

// "Start from a clean slate" without touching accounts, schools or prices.
// Scope `student_activity` removes what learners produced; `inactive_orders` archives
// (never deletes) unpaid and cancelled checkouts. Paid orders are always kept.
export async function previewStudentActivityReset(tx) {
  const row = await tx.one(`SELECT
    (SELECT count(*)::int FROM assessment_attempts) AS "attempts",
    (SELECT count(*)::int FROM assessment_question_marks) AS "marks",
    (SELECT count(*)::int FROM parent_learner_links WHERE status IN ('pending','approved')) AS "familyLinks",
    (SELECT count(*)::int FROM inbox_messages) AS "messages",
    (SELECT count(*)::int FROM marketplace_orders WHERE status <> 'paid') AS "unpaidOrders",
    (SELECT count(*)::int FROM guardian_exam_orders WHERE archived_at IS NULL AND status IN ('awaiting_payment','payment_failed','cancelled')) AS "inactivePreorders"`)
  return {
    scope: 'student_activity',
    counts: row,
    keeps: ['Accounts and roles', 'Institutions', 'Published resources', 'Paid orders', 'Exam prices and settings'],
    deletes: ['Assessment attempts and scores', 'Marking for those attempts', 'Pending family links', 'Inbox message history'],
    archivesOnly: ['Unpaid, failed and cancelled checkouts'],
    deletable: (row.attempts + row.familyLinks + row.messages + row.unpaidOrders + row.inactivePreorders) > 0,
    warnings: [
      row.attempts > 0 ? `${plural(row.attempts, 'assessment attempt')} with ${plural(row.marks, 'marked answer')} will be deleted.` : null,
      row.familyLinks > 0 ? `${plural(row.familyLinks, 'parent–learner link')} will be deleted.` : null,
      row.messages > 0 ? `${plural(row.messages, 'inbox message')} will be deleted.` : null,
      row.unpaidOrders + row.inactivePreorders > 0 ? `${plural(row.unpaidOrders + row.inactivePreorders, 'unfinished checkout')} will be archived, not deleted.` : null,
    ].filter(Boolean),
  }
}

export async function resetStudentActivity(tx, { actorUserId }) {
  const before = await previewStudentActivityReset(tx)
  if (!before.counts.attempts && !before.counts.familyLinks && !before.counts.messages && !before.counts.unpaidOrders && !before.counts.inactivePreorders) {
    return { ...before.counts, alreadyClear: true }
  }

  const stamp = new Date().toISOString()
  // attempt deletion cascades to assessment_question_marks
  const attempts = await tx.query('DELETE FROM assessment_attempts RETURNING id')
  const links = await tx.query(`DELETE FROM parent_learner_links WHERE status IN ('pending','approved') RETURNING id`)
  const messages = await tx.query('DELETE FROM inbox_messages RETURNING id')
  const orders = await tx.query(`UPDATE marketplace_orders SET archived_at=$1,archived_by=$2
    WHERE archived_at IS NULL AND status <> 'paid' RETURNING id`, [stamp, actorUserId])
  const preorders = await tx.query(`UPDATE guardian_exam_orders SET archived_at=$1,archived_by=$2,updated_at=$1
    WHERE archived_at IS NULL AND status IN ('awaiting_payment','payment_failed','cancelled') RETURNING id`, [stamp, actorUserId])

  return {
    attemptsRemoved: attempts.rowCount,
    familyLinksRemoved: links.rowCount,
    messagesRemoved: messages.rowCount,
    ordersArchived: orders.rowCount,
    preordersArchived: preorders.rowCount,
    alreadyClear: false,
  }
}

// ---------- purges ----------

export async function purgeUser(tx, { userId, actorUserId }) {
  const report = await checkUserDeletion(tx, userId)
  if (!report) return null
  if (!report.deletable) {
    const error = new Error(report.blockers.map((item) => item.message).join(' '))
    error.status = 409
    error.code = report.blockers[0].code
    error.blockers = report.blockers
    throw error
  }

  const snapshot = report.user.fullName || report.user.email || report.user.phone || 'Deleted account'
  const detail = {
    fullName: report.user.fullName,
    email: report.user.email,
    phone: report.user.phone,
    status: report.user.status,
  }

  // Preserve the trail, then detach it so the account row can go.
  await tx.query('UPDATE audit_events SET actor_snapshot=COALESCE(actor_snapshot,$2) WHERE actor_user_id=$1 AND actor_snapshot IS NULL', [userId, snapshot])
  await tx.query('UPDATE audit_events SET subject_snapshot=COALESCE(subject_snapshot,$2) WHERE subject_user_id=$1 AND subject_snapshot IS NULL', [userId, snapshot])
  await tx.query('UPDATE audit_events SET actor_user_id=NULL WHERE actor_user_id=$1', [userId])
  await tx.query('UPDATE audit_events SET subject_user_id=NULL WHERE subject_user_id=$1', [userId])

  // Detach remaining optional references (history columns, reviewer stamps).
  const detach = [
    ['institutions', 'created_by'],
    ['parent_learner_links', 'reviewed_by'],
    ['marketplace_submissions', 'reviewed_by'],
    ['seller_settlements', 'settled_by'],
    ['teacher_payout_requests', 'reviewed_by'],
    ['teacher_payout_requests', 'paid_by'],
    ['wallet_ledger', 'actor_user_id'],
    ['academic_curricula', 'created_by'],
    ['admin_cms_settings', 'updated_by'],
    ['subscription_plans', 'created_by'],
    ['subscription_plans', 'updated_by'],
    ['guardian_exam_pricing', 'updated_by'],
    ['guardian_exam_settings', 'updated_by'],
    ['marketplace_orders', 'archived_by'],
    ['guardian_exam_orders', 'archived_by'],
  ]
  for (const [table, column] of detach) {
    await tx.query(`UPDATE ${table} SET ${column}=NULL WHERE ${column}=$1`, [userId])
  }

  // Invitations this account sent are no longer attributable.
  await tx.query('DELETE FROM role_invitations WHERE invited_by=$1', [userId])
  await tx.query('UPDATE role_invitations SET accepted_by=NULL WHERE accepted_by=$1', [userId])

  // Financial rows that the guard already proved are empty or unreferenced.
  await tx.query(`DELETE FROM seller_settlements WHERE seller_user_id=$1`, [userId])
  await tx.query(`DELETE FROM teacher_payout_requests WHERE teacher_user_id=$1`, [userId])
  await tx.query(`DELETE FROM wallet_ledger WHERE user_id=$1`, [userId])
  await tx.query(`DELETE FROM wallet_accounts WHERE user_id=$1`, [userId])

  await tx.query('DELETE FROM users WHERE id=$1', [userId])

  return { snapshot, detail }
}

export async function purgeInstitution(tx, { institutionId, keepClaims = true }) {
  const report = await checkInstitutionDeletion(tx, institutionId)
  if (!report) return null
  if (!report.deletable) {
    const error = new Error(report.blockers.map((item) => item.message).join(' '))
    error.status = 409
    error.code = report.blockers[0].code
    error.blockers = report.blockers
    throw error
  }

  const name = report.institution.name

  // Approved applications stay as an audit trail but no longer point at a live institution.
  if (keepClaims) {
    await tx.query('UPDATE institution_applications SET institution_id=NULL WHERE institution_id=$1', [institutionId])
  }

  // Remove the memberships that would otherwise cascade silently so we can report the count.
  const members = await tx.query('DELETE FROM user_roles WHERE institution_id=$1 RETURNING id', [institutionId])
  await tx.query('DELETE FROM role_invitations WHERE institution_id=$1', [institutionId])
  await tx.query('DELETE FROM assessments WHERE institution_id=$1', [institutionId])
  await tx.query('DELETE FROM marketplace_submissions WHERE institution_id=$1', [institutionId])

  await tx.query('DELETE FROM institutions WHERE id=$1', [institutionId])

  return { name, membershipsRemoved: members.rowCount }
}
