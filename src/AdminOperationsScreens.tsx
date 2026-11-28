import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Building2, ChartNoAxesCombined, CircleAlert, ClipboardList, Download, FileCheck2, RefreshCw, Search, ShoppingBag, Users, WalletCards } from 'lucide-react'
import { marketplaceApi, type CatalogProduct, type MarketplaceSubmissionRecord, type SellerSettlement, type TeacherPayout } from './marketplaceApi'
import { inboxApi, type InboxRecipient } from './inboxApi'
import './admin-operations.css'

export type AdminOperationsPage = 'Content library' | 'Question bank' | 'Examinations' | 'Orders & commerce' | 'Reports & analytics'

type Institution = { id: string; name: string; status: string }
type AdminAssessment = { id: string; title: string; mode: string; status: string; joinCode: string; createdAt: string; publishedAt: string | null; institutionName: string; teacherName: string; questionCount: number; attemptCount: number; averageScorePercent: number | null }
type AdminOrder = { id: string; status: string; totalKes: number; deliveryFeeKes: number; fulfillmentStatus: string; carrierName: string | null; trackingCode: string | null; trackingUrl: string | null; recipientName: string | null; recipientPhone: string | null; deliveryAddress: string | null; paymentMethod: string | null; paymentReference: string | null; isSimulatedPayment: boolean; createdAt: string; paidAt: string | null; archivedAt: string | null; buyerName: string; buyerEmail: string; items: Array<{ id: string; title: string; fileName: string | null; hasPrintMaster: boolean; unitPriceKes: number; quantity: number; productType: 'single_paper' | 'series' }> }
type AdminSchoolOrder = { id: string; schoolName: string; contactName: string; email: string; county: string; town: string; deliveryAddress: string; grades: Array<{ gradeLabel: string; quantity: number }>; totalStudents: number; totalKes: number; status: string; createdAt: string; archivedAt: string | null }
type AdminQuestion = { id: string; prompt: string; questionType: string; options: unknown[]; marks: number; createdAt: string; assessmentId: string; assessmentTitle: string; institutionName: string; teacherName: string }
type ReportData = { users: InboxRecipient[]; institutions: Institution[]; submissions: MarketplaceSubmissionRecord[]; settlements: SellerSettlement[]; payouts: TeacherPayout[]; products: CatalogProduct[]; assessments: AdminAssessment[]; orders: AdminOrder[]; schoolOrders: AdminSchoolOrder[]; questions: AdminQuestion[] }

async function getAdminRecords<T>(path: string, key: string): Promise<T[]> {
  const response = await fetch(path, { credentials: 'include' })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || `Could not load ${key}.`)
  return Array.isArray(payload[key]) ? payload[key] as T[] : []
}

async function loadInstitutions() {
  const response = await fetch('/api/admin/institutions', { credentials: 'include' })
  const payload = await response.json().catch(() => ({})) as { institutions?: Institution[]; error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || 'Could not load institution data.')
  return payload.institutions ?? []
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminOperationsScreens({ page, onNavigate }: { page: AdminOperationsPage; onNavigate: (page: string) => void }) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MarketplaceSubmissionRecord | null>(null)
  const [fulfillmentSaving, setFulfillmentSaving] = useState<string | null>(null)
  const [courier, setCourier] = useState<Record<string, { name: string; code: string; url: string }>>({})
  const [showArchivedMarketOrders, setShowArchivedMarketOrders] = useState(false)
  const [showArchivedSchoolOrders, setShowArchivedSchoolOrders] = useState(false)
  const [orderMessage, setOrderMessage] = useState('')

  const refresh = async (marketArchived = showArchivedMarketOrders, schoolArchived = showArchivedSchoolOrders) => {
    setLoading(true)
    setError('')
    try {
      const [users, institutions, submissions, settlements, payouts, catalog, assessments, orders, schoolOrders, questions] = await Promise.all([
        inboxApi.users(), loadInstitutions(), marketplaceApi.adminSubmissions('all'), marketplaceApi.adminSettlements('all'), marketplaceApi.adminPayouts('all'), marketplaceApi.catalog(),
        getAdminRecords<AdminAssessment>('/api/admin/assessments', 'assessments'), getAdminRecords<AdminOrder>(`/api/admin/marketplace-orders?archived=${marketArchived}`, 'orders'), getAdminRecords<AdminSchoolOrder>(`/api/admin/guardian-exam-orders?archived=${schoolArchived}`, 'school preorders'), getAdminRecords<AdminQuestion>('/api/admin/question-bank', 'questions'),
      ])
      setData({ users: users.users, institutions, submissions: submissions.submissions, settlements: settlements.settlements, payouts: payouts.payouts, products: catalog.products, assessments, orders, schoolOrders, questions })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load live administration data.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const updateFulfillment = async (orderId: string, status: 'printing' | 'ready_for_dispatch' | 'dispatched' | 'delivered', carrierName?: string, trackingCode?: string, trackingUrl?: string) => {
    setFulfillmentSaving(orderId); setError('')
    try {
      const response = await fetch(`/api/admin/marketplace-orders/${encodeURIComponent(orderId)}/fulfillment`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, carrierName, trackingCode, trackingUrl }) })
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || 'Could not update delivery status.')
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update delivery status.') }
    finally { setFulfillmentSaving(null) }
  }

  const archiveOrder = async (kind: 'marketplace' | 'school', orderId: string, archived: boolean) => {
    const title = kind === 'marketplace' ? 'marketplace order' : 'school preorder'
    if (!window.confirm(`${archived ? 'Archive' : 'Restore'} this ${title}? Archived orders remain in the database and can be restored.`)) return
    setError(''); setOrderMessage('')
    try {
      const endpoint = kind === 'marketplace' ? 'marketplace-orders' : 'guardian-exam-orders'
      const response = await fetch(`/api/admin/${endpoint}/${encodeURIComponent(orderId)}/archive`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }) })
      const body = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || `Could not ${archived ? 'archive' : 'restore'} this ${title}.`)
      setOrderMessage(body.message || 'Order updated.')
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this order.') }
  }

  const clearOrderQueue = async (kind: 'marketplace' | 'school') => {
    const marketplace = kind === 'marketplace'
    const confirmation = marketplace
      ? 'Archive all simulated marketplace orders from the active list? Live M-PESA orders will be left untouched. Records remain recoverable.'
      : 'Archive inactive school preorders (awaiting payment, failed, or cancelled)? Paid orders and payment checks will remain active. Records remain recoverable.'
    if (!window.confirm(confirmation)) return
    setError(''); setOrderMessage('')
    try {
      const endpoint = marketplace ? 'marketplace-orders/archive-simulated' : 'guardian-exam-orders/archive-inactive'
      const response = await fetch(`/api/admin/${endpoint}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
      const body = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Could not clear these orders.')
      setOrderMessage(body.message || 'Orders archived from the active list.')
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not clear these orders.') }
  }

  const filteredProducts = useMemo(() => (data?.products ?? []).filter((product) => `${product.title} ${product.grade} ${product.subject} ${product.curriculum} ${product.vendorName} ${product.institutionName}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const filteredAssessments = useMemo(() => (data?.assessments ?? []).filter((record) => `${record.title} ${record.institutionName} ${record.teacherName} ${record.status}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const filteredOrders = useMemo(() => (data?.orders ?? []).filter((record) => `${record.id} ${record.buyerName} ${record.buyerEmail} ${record.status} ${record.recipientName} ${record.recipientPhone} ${record.deliveryAddress} ${(record.items ?? []).map((item) => item.title).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const filteredSchoolOrders = useMemo(() => (data?.schoolOrders ?? []).filter((record) => `${record.id} ${record.schoolName} ${record.contactName} ${record.email} ${record.town} ${record.county} ${record.deliveryAddress} ${record.status}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const filteredQuestions = useMemo(() => (data?.questions ?? []).filter((record) => `${record.prompt} ${record.questionType} ${record.assessmentTitle} ${record.institutionName}`.toLowerCase().includes(query.toLowerCase())), [data, query])

  const heading = {
    'Content library': ['APPROVED MARKETPLACE RESOURCES', 'Content library', 'Published resources that customers can currently discover in the marketplace.'],
    'Question bank': ['QUESTION AUTHORING & REUSE', 'Question bank', 'Track how verified content feeds reusable questions for assessment creation.'],
    Examinations: ['PLATFORM EXAM REGISTER', 'Examinations', 'A global view of school assessments, publishing status and participation.'],
    'Orders & commerce': ['MARKETPLACE & SCHOOL ORDERS', 'Orders & commerce', 'Manage marketplace purchases and Guardian Exams school preorders in separate lists.'],
    'Reports & analytics': ['LIVE PLATFORM REPORTING', 'Reports & analytics', 'Operational counts from connected account, content and seller finance records.'],
  }[page]

  return <section className="ws-card admin-operations-screen">
    <header className="admin-operations-heading"><div><span className="ws-kicker">{heading[0]}</span><h2>{heading[1]}</h2><p>{heading[2]}</p></div><button className="ws-button ws-light" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></header>
    {error && <div className="admin-operations-error" role="alert"><CircleAlert size={17}/><span><strong>Could not load live administration data</strong><small>{error}</small></span><button className="ws-button ws-light" onClick={() => void refresh()}>Retry</button></div>}
    {page === 'Content library' && <>
      <div className="admin-operations-stats"><article><BookOpen size={17}/><span><strong>{loading ? '—' : data?.products.length ?? 0}</strong><small>Published resources</small></span></article><article><FileCheck2 size={17}/><span><strong>{loading ? '—' : data?.submissions.filter((item) => item.status === 'submitted').length ?? 0}</strong><small>Awaiting review</small></span></article><article><Building2 size={17}/><span><strong>{loading ? '—' : new Set((data?.products ?? []).map((item) => item.institutionName)).size}</strong><small>Active providers</small></span></article></div>
      <div className="admin-operations-toolbar"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search published resources"/></label><button className="ws-button ws-light" onClick={() => onNavigate('Review queue')}>Open review queue <ArrowRight size={14}/></button></div>
      {loading ? <div className="admin-operations-empty"><RefreshCw size={19}/><strong>Loading published resources…</strong></div> : filteredProducts.length === 0 ? <div className="admin-operations-empty"><BookOpen size={21}/><strong>{data?.products.length ? 'No matching resources' : 'No resources published yet'}</strong><small>{data?.products.length ? 'Try a different title, provider, grade or subject.' : 'Approved teacher or publisher submissions will appear here and become visible to buyers.'}</small>{!data?.products.length && <button className="ws-button ws-primary" onClick={() => onNavigate('Review queue')}>Review submissions <ArrowRight size={14}/></button>}</div> : <div className="admin-operations-table-wrap"><table className="admin-operations-table"><thead><tr><th>Resource</th><th>Provider</th><th>Coverage</th><th>Price</th><th>Published</th><th></th></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id}><td><strong>{product.title}</strong><small>{product.resource} · {product.questionCount} questions</small></td><td>{product.institutionName}<small>{product.vendorName}</small></td><td>{product.curriculum} · {product.grade}<small>{product.subject} · {product.term} · {product.academicYear}</small></td><td>KSh {Number(product.priceKes).toLocaleString()}</td><td>{new Date(product.publishedAt).toLocaleDateString()}</td><td><button className="admin-operations-row-action" onClick={() => setSelected(data?.submissions.find((item) => item.id === product.id) ?? null)} aria-label={`View ${product.title}`}><ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>}
    </>}
    {page === 'Question bank' && <>
      <div className="admin-operations-intro"><span className="admin-operations-icon tone-violet"><ClipboardList size={19}/></span><div><strong>Questions currently attached to assessments</strong><p>Review authored question text, type, marks, school and source assessment. The reusable, independently curated question bank and versioning workflow are still a separate feature.</p></div></div>
      <div className="admin-operations-toolbar"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search question text, school or assessment"/></label></div>
      {loading ? <div className="admin-operations-empty"><RefreshCw size={19}/><strong>Loading assessment questions…</strong></div> : filteredQuestions.length === 0 ? <div className="admin-operations-empty"><ClipboardList size={21}/><strong>{data?.questions.length ? 'No matching questions' : 'No assessment questions yet'}</strong><small>Questions created in teacher assessments will appear here for platform review.</small></div> : <div className="admin-operations-table-wrap"><table className="admin-operations-table"><thead><tr><th>Question</th><th>Type · marks</th><th>Source assessment</th><th>School · author</th></tr></thead><tbody>{filteredQuestions.map((question) => <tr key={question.id}><td><strong>{question.prompt}</strong><small>{question.id.slice(0, 8).toUpperCase()}</small></td><td>{question.questionType}<small>{Number(question.marks)} marks</small></td><td>{question.assessmentTitle}</td><td>{question.institutionName}<small>{question.teacherName}</small></td></tr>)}</tbody></table></div>}
    </>}
    {page === 'Examinations' && <>
      <div className="admin-operations-stats"><article><ClipboardList size={17}/><span><strong>{loading ? '—' : data?.assessments.length ?? 0}</strong><small>Assessments</small></span></article><article><FileCheck2 size={17}/><span><strong>{loading ? '—' : (data?.assessments ?? []).filter((item) => item.status === 'published').length}</strong><small>Published</small></span></article><article><Users size={17}/><span><strong>{loading ? '—' : data?.assessments.reduce((sum, item) => sum + item.attemptCount, 0) ?? 0}</strong><small>Learner attempts</small></span></article></div>
      <div className="admin-operations-toolbar"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assessment, school, teacher or status"/></label><button className="ws-button ws-light" onClick={() => onNavigate('Institutions')}>Institutions <ArrowRight size={14}/></button></div>
      {loading ? <div className="admin-operations-empty"><RefreshCw size={19}/><strong>Loading assessments…</strong></div> : filteredAssessments.length === 0 ? <div className="admin-operations-empty"><ClipboardList size={21}/><strong>No assessments created yet</strong><small>When teachers create assessments for their schools, their live records and participation will appear here.</small></div> : <div className="admin-operations-table-wrap"><table className="admin-operations-table"><thead><tr><th>Assessment</th><th>School · teacher</th><th>Status</th><th>Questions · attempts</th><th>Average</th></tr></thead><tbody>{filteredAssessments.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.mode} · code {item.joinCode}</small></td><td>{item.institutionName}<small>{item.teacherName}</small></td><td><span className={`admin-operations-status ${item.status}`}>{item.status}</span></td><td>{item.questionCount} questions<small>{item.attemptCount} attempts</small></td><td>{item.averageScorePercent === null ? '—' : `${item.averageScorePercent}%`}</td></tr>)}</tbody></table></div>}
    </>}
    {page === 'Orders & commerce' && <>
      {orderMessage && <p className="integration-success" role="status">{orderMessage}</p>}
      <div className="admin-operations-stats"><article><ShoppingBag size={17}/><span><strong>{loading ? '—' : data?.orders.length ?? 0}</strong><small>{showArchivedMarketOrders ? 'Archived marketplace orders' : 'Marketplace orders'}</small></span></article><article><WalletCards size={17}/><span><strong>{loading ? '—' : (data?.orders ?? []).filter((item) => ['payment_review','payment_pending','awaiting_payment'].includes(item.status)).length}</strong><small>Payment attention</small></span></article><article><ChartNoAxesCombined size={17}/><span><strong>{loading ? '—' : (data?.orders ?? []).filter((item) => item.status === 'paid').length}</strong><small>Paid marketplace orders</small></span></article><article><Building2 size={17}/><span><strong>{loading ? '—' : data?.schoolOrders.length ?? 0}</strong><small>{showArchivedSchoolOrders ? 'Archived school preorders' : 'School preorders'}</small></span></article></div>
      <section className="admin-order-section"><header className="admin-order-section-heading"><div><span className="ws-kicker">MARKETPLACE CHECKOUTS</span><h3>{showArchivedMarketOrders ? 'Archived marketplace orders' : 'Marketplace orders'}</h3><p>Printed past-paper purchases from the marketplace. Simulated orders can be cleared from this active list.</p></div><div><button className="ws-button ws-light" onClick={() => { const next = !showArchivedMarketOrders; setShowArchivedMarketOrders(next); void refresh(next, showArchivedSchoolOrders) }}>{showArchivedMarketOrders ? 'Show active' : 'Show archived'}</button><button className="ws-button ws-light admin-order-clear" onClick={() => void clearOrderQueue('marketplace')} disabled={loading || showArchivedMarketOrders}>Clear simulated orders</button><button className="ws-button ws-light" onClick={() => onNavigate('Teacher payouts')}>Teacher payouts <ArrowRight size={14}/></button></div></header>
        <div className="admin-operations-toolbar"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, buyer, resource or status"/></label></div>
        {loading ? <div className="admin-operations-empty"><RefreshCw size={19}/><strong>Loading marketplace orders…</strong></div> : filteredOrders.length === 0 ? <div className="admin-operations-empty"><ShoppingBag size={21}/><strong>{showArchivedMarketOrders ? 'No archived marketplace orders' : 'No marketplace orders'}</strong><small>Marketplace purchases appear here, separately from school preorders.</small></div> : <div className="admin-operations-table-wrap"><table className="admin-operations-table"><thead><tr><th>Order · buyer</th><th>Print masters</th><th>Delivery & fulfilment</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>{filteredOrders.map((order) => { const next: Record<string, 'printing' | 'ready_for_dispatch' | 'dispatched' | 'delivered'> = { processing: 'printing', printing: 'ready_for_dispatch', ready_for_dispatch: 'dispatched', dispatched: 'delivered' }; const fields = courier[order.id] || { name: order.carrierName || '', code: order.trackingCode || '', url: order.trackingUrl || '' }; return <tr key={order.id}><td><strong>{order.id.slice(0, 8).toUpperCase()}</strong><small>{order.buyerName} · {order.buyerEmail}</small></td><td>{(order.items ?? []).map((item) => <div key={item.id}><a href={`/api/admin/marketplace-order-items/${encodeURIComponent(item.id)}/file`}>{item.title} · {item.fileName || 'print master'}</a><small>{item.productType === 'series' ? 'Complete series' : 'Single paper'} × {item.quantity} · {item.hasPrintMaster ? 'Ready to print' : 'Missing file'}</small></div>)}</td><td>{order.recipientName || order.buyerName}<small>{order.recipientPhone || 'Phone unavailable'} · {order.deliveryAddress || 'Address unavailable'}</small><small>Delivery KSh {Number(order.deliveryFeeKes || 0).toLocaleString()} · {order.fulfillmentStatus || 'awaiting_payment'}</small>{order.status === 'paid' && order.fulfillmentStatus === 'ready_for_dispatch' && <div><input aria-label="Courier name" placeholder="Courier name" value={fields.name} onChange={(event) => setCourier({ ...courier, [order.id]: { ...fields, name: event.target.value } })}/><input aria-label="Tracking code" placeholder="Tracking code (optional)" value={fields.code} onChange={(event) => setCourier({ ...courier, [order.id]: { ...fields, code: event.target.value } })}/><input aria-label="Tracking URL" placeholder="HTTPS tracking link (optional)" value={fields.url} onChange={(event) => setCourier({ ...courier, [order.id]: { ...fields, url: event.target.value } })}/></div>}{order.carrierName && <small>Courier: {order.carrierName}{order.trackingCode ? ` · ${order.trackingCode}` : ''}</small>}{order.status === 'paid' && next[order.fulfillmentStatus] && <button className="admin-operations-row-action" disabled={fulfillmentSaving === order.id || (order.fulfillmentStatus === 'ready_for_dispatch' && !fields.name.trim())} onClick={() => void updateFulfillment(order.id, next[order.fulfillmentStatus], fields.name, fields.code, fields.url)}>{fulfillmentSaving === order.id ? 'Saving…' : ({ processing: 'Start printing', printing: 'Mark print ready', ready_for_dispatch: 'Dispatch order', dispatched: 'Mark delivered' } as Record<string, string>)[order.fulfillmentStatus]}</button>}</td><td>KSh {Number(order.totalKes).toLocaleString()}</td><td>{order.paymentMethod || 'Pending'}<small>{order.isSimulatedPayment ? 'Simulated payment' : order.paymentReference || 'M-PESA'}</small></td><td><span className={`admin-operations-status ${order.status}`}>{order.status.replaceAll('_', ' ')}</span></td><td>{new Date(order.createdAt).toLocaleDateString()}</td><td><button className="admin-operations-row-action" onClick={() => void archiveOrder('marketplace', order.id, !showArchivedMarketOrders)}>{showArchivedMarketOrders ? 'Restore' : 'Archive'}</button></td></tr> })}</tbody></table></div>}
      </section>
      <section className="admin-order-section admin-school-preorders"><header className="admin-order-section-heading"><div><span className="ws-kicker">GUARDIAN EXAMS · SCHOOL CHECKOUT</span><h3>{showArchivedSchoolOrders ? 'Archived school preorders' : 'School preorders'}</h3><p>These are separate from marketplace purchases. Orders submitted from “Pre-order Guardian Exams” are saved here and in Exam pricing.</p></div><div><button className="ws-button ws-light" onClick={() => { const next = !showArchivedSchoolOrders; setShowArchivedSchoolOrders(next); void refresh(showArchivedMarketOrders, next) }}>{showArchivedSchoolOrders ? 'Show active' : 'Show archived'}</button><button className="ws-button ws-light admin-order-clear" onClick={() => void clearOrderQueue('school')} disabled={loading || showArchivedSchoolOrders}>Clear inactive preorders</button><button className="ws-button ws-primary" onClick={() => onNavigate('Exam pricing')}>Manage prices <ArrowRight size={14}/></button></div></header>
        {loading ? <div className="admin-operations-empty"><RefreshCw size={19}/><strong>Loading school preorders…</strong></div> : filteredSchoolOrders.length === 0 ? <div className="admin-operations-empty"><Building2 size={21}/><strong>{showArchivedSchoolOrders ? 'No archived school preorders' : 'No school preorders yet'}</strong><small>When a school submits the exam pre-order checkout, its grades, contact, delivery details, total and payment state will appear here.</small></div> : <div className="admin-operations-table-wrap"><table className="admin-operations-table"><thead><tr><th>School · contact</th><th>Delivery location</th><th>Order contents</th><th>Total</th><th>Payment</th><th>Date</th><th>Action</th></tr></thead><tbody>{filteredSchoolOrders.map((order) => <tr key={order.id}><td><strong>{order.schoolName}</strong><small>{order.contactName} · {order.email}</small><small>{order.id.slice(0, 8).toUpperCase()}</small></td><td>{order.town}, {order.county}<small>{order.deliveryAddress}</small></td><td>{order.totalStudents} students · {order.grades.length} grades</td><td>KSh {Number(order.totalKes).toLocaleString('en-KE')}</td><td><span className={`admin-operations-status ${order.status}`}>{order.status.replaceAll('_', ' ')}</span></td><td>{new Date(order.createdAt).toLocaleDateString('en-KE')}</td><td><button className="admin-operations-row-action" onClick={() => void archiveOrder('school', order.id, !showArchivedSchoolOrders)}>{showArchivedSchoolOrders ? 'Restore' : 'Archive'}</button></td></tr>)}</tbody></table></div>}
        <small className="admin-order-archive-note">Archive removes an order from the active list without deleting payment or audit history. Bulk clearing only archives simulated marketplace orders or inactive unpaid preorders.</small>
      </section>
    </>}
    {page === 'Reports & analytics' && <>
      <div className="admin-operations-toolbar report-toolbar"><span>Live counts from connected admin APIs. No sample figures are included.</span><button className="ws-button ws-light" disabled={loading || !data} onClick={() => { if (!data) return; downloadCsv('guardian-admin-overview.csv', [['Metric', 'Value'], ['Registered accounts', String(data.users.length)], ['Institution records', String(data.institutions.length)], ['Submitted marketplace resources', String(data.submissions.filter((item) => item.status === 'submitted').length)], ['Approved marketplace resources', String(data.submissions.filter((item) => item.status === 'approved').length)], ['Seller settlement records', String(data.settlements.length)], ['Teacher payout requests', String(data.payouts.length)]]) }}><Download size={14}/> Export live summary</button></div>
      <div className="admin-operations-report-grid">{[
        ['Registered accounts', data?.users.length, 'Users endpoint · includes all assigned roles'],
        ['Institutions', data?.institutions.length, 'Admin institution directory'],
        ['Pending content review', data?.submissions.filter((item) => item.status === 'submitted').length, 'Teacher marketplace submissions'],
        ['Published resources', data?.products.length, 'Approved marketplace catalogue'],
        ['Seller settlements', data?.settlements.length, 'Seller-share ledger entries · not gross order value'],
        ['Payout requests', data?.payouts.length, 'Teacher wallet payout requests'],
      ].map(([label, value, source]) => <article key={String(label)}><span>{label}</span><strong>{loading ? '—' : value ?? 0}</strong><small>{source}</small></article>)}</div>
      <div className="admin-operations-notice"><CircleAlert size={16}/><span>Financial totals by date, learner activity, assessment outcomes, and institution comparisons are not reported here yet because those analytics endpoints are not connected. Values above are live record counts only.</span></div>
    </>}
    {selected && <div className="admin-operations-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="admin-operations-modal" role="dialog" aria-modal="true" aria-labelledby="admin-resource-title"><button onClick={() => setSelected(null)} aria-label="Close resource details">×</button><span className="ws-kicker">PUBLISHED RESOURCE</span><h2 id="admin-resource-title">{selected.title}</h2><p>{selected.description}</p><dl>{[['Provider', selected.institutionName || selected.vendor || '—'], ['Curriculum', selected.curriculum], ['Grade and subject', `${selected.grade} · ${selected.subject}`], ['Academic period', `${selected.term} · ${selected.year}`], ['Included', selected.resource], ['File record', selected.fileName || 'No actual file attached'], ['Price', `KSh ${Number(selected.price).toLocaleString()}`]].map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl><small>Marketplace file upload and digital delivery are not connected yet.</small></section></div>}
  </section>
}
