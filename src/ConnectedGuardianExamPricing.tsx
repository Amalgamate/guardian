import { useCallback, useEffect, useState } from 'react'
import { Check, RefreshCw, Save, Truck } from 'lucide-react'
import './guardian-exam-pricing.css'

type GradePrice = { gradeCode: string; gradeLabel: string; unitPriceKes: number; updatedAt?: string }
type Order = { id: string; schoolName: string; contactName: string; email: string; county: string; town: string; grades: Array<{gradeLabel: string; quantity: number; unitPriceKes: number; subtotalKes: number}>; totalStudents: number; subtotalKes: number; deliveryFeeKes: number; totalKes: number; status: string; paymentReference?: string | null; createdAt: string }
const money = (value: number) => `KSh ${Number(value || 0).toLocaleString('en-KE')}`

export default function ConnectedGuardianExamPricing() {
  const [grades, setGrades] = useState<GradePrice[]>([])
  const [deliveryFeeKes, setDeliveryFeeKes] = useState(300)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewFields, setReviewFields] = useState<Record<string, { receipt: string; note: string }>>({})
  const [reviewBusy, setReviewBusy] = useState('')
  const request = async (url: string, options?: RequestInit) => {
    const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } })
    const body = await response.json()
    if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Request failed.')
    return body
  }
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [pricing, orderResult] = await Promise.all([request('/api/admin/guardian-exam-pricing'), request('/api/admin/guardian-exam-orders')])
      setGrades(pricing.grades || []); setDeliveryFeeKes(Number(pricing.deliveryFeeKes ?? 300)); setOrders(orderResult.orders || [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Guardian Exams pricing.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const save = async () => {
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await request('/api/admin/guardian-exam-pricing', { method: 'PUT', body: JSON.stringify({ grades: grades.map(({ gradeCode, unitPriceKes }) => ({ gradeCode, unitPriceKes: Number(unitPriceKes) })), deliveryFeeKes: Number(deliveryFeeKes) }) })
      setGrades(result.grades || []); setMessage(result.message || 'Prices saved.')
      window.setTimeout(() => setMessage(''), 5000)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save prices.') }
    finally { setSaving(false) }
  }
  const resolveReview = async (order: Order, decision: 'paid' | 'failed') => {
    const fields = reviewFields[order.id] || { receipt: '', note: '' }
    setReviewBusy(order.id); setError(''); setMessage('')
    try {
      const result = await request(`/api/admin/guardian-exam-orders/${order.id}/review`, { method: 'POST', body: JSON.stringify({ decision, receipt: fields.receipt, note: fields.note }) })
      setMessage(result.message || 'Payment review saved.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resolve this payment review.') }
    finally { setReviewBusy('') }
  }
  return <div className="admin-guardian-pricing">
    <section className="ws-card">
      <div className="ws-card-heading"><div><span className="ws-kicker">GUARDIAN EXAMS · PRICING</span><h2>Exam pack prices</h2><p>Prices are per student for that grade’s complete exam pack. New prices apply to new orders; existing orders keep their saved price.</p></div><button className="ws-button ws-light" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      {error && <p role="alert" className="integration-error">{error}</p>}{message && <p role="status" className="integration-success"><Check size={15}/>{message}</p>}
      {loading ? <p>Loading current prices…</p> : <>
        <div className="ws-settings-row"><span><strong>Countrywide delivery</strong><small>Charged once per school order</small></span><label className="guardian-price-input"><span>KSh</span><input aria-label="Delivery fee in Kenyan shillings" type="number" min="0" step="1" value={deliveryFeeKes} onChange={(event) => setDeliveryFeeKes(Number(event.target.value))}/></label></div>
        <div className="guardian-price-grid">{grades.map((grade) => <label className="guardian-price-card" key={grade.gradeCode}><span>{grade.gradeLabel}</span><small>Per student · full pack</small><span className="guardian-price-input"><span>KSh</span><input aria-label={`${grade.gradeLabel} price per student`} type="number" min="0" step="1" value={grade.unitPriceKes} onChange={(event) => setGrades((current) => current.map((row) => row.gradeCode === grade.gradeCode ? { ...row, unitPriceKes: Number(event.target.value) } : row))}/></span></label>)}</div>
        <div className="ws-editor-footer"><small>Every price change is recorded in the admin audit log.</small><button className="ws-button ws-primary" disabled={saving || grades.length !== 12} onClick={() => void save()}>{saving ? 'Saving…' : <><Save size={15}/> Save prices</>}</button></div>
      </>}
    </section>
    <section className="ws-card guardian-orders-card"><div className="ws-card-heading"><div><span className="ws-kicker">SCHOOL ORDERS</span><h2>Recent Guardian Exam orders</h2><p>Review the grade quantities, saved price breakdown, delivery location and payment state.</p></div></div>{orders.length ? <div className="guardian-orders-list">{orders.map((order) => <article className="guardian-admin-order" key={order.id}><div className="guardian-admin-order-head"><div><strong>{order.schoolName}</strong><small>{order.contactName} · {order.email}</small><small>{order.town}, {order.county}</small></div><span className={`ws-status status-${order.status.replaceAll('_','-')}`}>{order.status.replaceAll('_',' ')}</span></div><div className="guardian-admin-order-grades">{order.grades.map((grade) => <span key={grade.gradeLabel}>{grade.gradeLabel}: {grade.quantity} × {money(grade.unitPriceKes)} = <b>{money(grade.subtotalKes)}</b></span>)}</div><div className="guardian-admin-order-total"><span>{order.totalStudents} students · Delivery {money(order.deliveryFeeKes)}</span><strong>{money(order.totalKes)}</strong></div>{order.status === 'payment_review' && <div className="guardian-order-review"><label>Verified M-PESA receipt<input value={reviewFields[order.id]?.receipt || ''} onChange={(event) => setReviewFields((current) => ({ ...current, [order.id]: { receipt: event.target.value, note: current[order.id]?.note || '' } }))} placeholder="Required to confirm payment"/></label><label>Reconciliation note<textarea rows={2} value={reviewFields[order.id]?.note || ''} onChange={(event) => setReviewFields((current) => ({ ...current, [order.id]: { receipt: current[order.id]?.receipt || '', note: event.target.value } }))} placeholder="What did you verify against Safaricom?"/></label><div><button className="ws-button ws-light" disabled={Boolean(reviewBusy)} onClick={() => void resolveReview(order, 'failed')}>Mark unpaid</button><button className="ws-button ws-primary" disabled={Boolean(reviewBusy)} onClick={() => void resolveReview(order, 'paid')}>{reviewBusy === order.id ? 'Saving…' : 'Confirm verified payment'}</button></div></div>}<small>Order {order.id} · {new Date(order.createdAt).toLocaleString('en-KE')}{order.paymentReference ? ` · ${order.paymentReference}` : ''}</small></article>)}</div> : <div className="ws-live-empty"><span className="ws-circle-icon"><Truck size={18}/></span><h2>No school orders yet</h2><p>Orders submitted from the public Guardian Exams checkout will appear here.</p></div>}</section>
  </div>
}
