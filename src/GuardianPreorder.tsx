import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, GraduationCap, MapPin, School, Truck } from 'lucide-react'

type GradePrice = { gradeCode: string; gradeLabel: string; unitPriceKes: number }
type OrderLine = GradePrice & { quantity: number; subtotalKes: number }
type SchoolOrder = { school: string; contact: string; email: string; phone: string; county: string; town: string; address: string }
type SavedOrder = { id: string; status: string; grades: OrderLine[]; totalStudents: number; subtotalKes: number; deliveryFeeKes: number; totalKes: number; paymentReference?: string | null; paymentError?: string | null }
const initialSchoolOrder: SchoolOrder = { school: '', contact: '', email: '', phone: '', county: '', town: '', address: '' }
const money = (value: number) => `KSh ${Number(value || 0).toLocaleString('en-KE')}`

export default function GuardianPreorder({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'details' | 'review' | 'waiting' | 'complete'>('details')
  const [order, setOrder] = useState<SchoolOrder>(initialSchoolOrder)
  const [prices, setPrices] = useState<GradePrice[]>([])
  const [deliveryFeeKes, setDeliveryFeeKes] = useState(300)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [savedOrder, setSavedOrder] = useState<SavedOrder | null>(null)
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [error, setError] = useState('')
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [paymentStarted, setPaymentStarted] = useState(false)
  const [orderStatus, setOrderStatus] = useState('awaiting_payment')
  const lines = useMemo(() => prices.filter((grade) => Number(quantities[grade.gradeCode]) > 0).map((grade) => ({ ...grade, quantity: Number(quantities[grade.gradeCode]), subtotalKes: Number(grade.unitPriceKes) * Number(quantities[grade.gradeCode]) })), [prices, quantities])
  const totalStudents = lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotalKes = lines.reduce((sum, line) => sum + line.subtotalKes, 0)
  const totalKes = subtotalKes + deliveryFeeKes

  useEffect(() => {
    let active = true
    fetch('/api/public/guardian-exam-pricing').then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || 'Pricing is temporarily unavailable.')
      if (active) { setPrices(body.grades || []); setDeliveryFeeKes(Number(body.deliveryFeeKes ?? 300)) }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Pricing is temporarily unavailable.') })
      .finally(() => { if (active) setLoadingPrices(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (step !== 'waiting' || !savedOrder?.id || !paymentStarted || orderStatus === 'paid' || orderStatus === 'payment_failed' || orderStatus === 'payment_review') return
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/public/guardian-exam-orders/${savedOrder.id}`)
        const body = await response.json()
        if (response.ok && body.order?.status) {
          setOrderStatus(body.order.status)
          setSavedOrder((current) => current ? { ...current, ...body.order } : current)
          if (body.order.status === 'paid') setStep('complete')
          if (body.order.status === 'payment_failed' || body.order.status === 'payment_review') setError(body.order.paymentError || (body.order.status === 'payment_review' ? 'Payment is being checked by our team. Keep your order reference.' : 'Payment was not completed. You may try again.'))
        }
      } catch { /* Keep polling; temporary network errors should not lose checkout state. */ }
    }, 3500)
    return () => window.clearInterval(timer)
  }, [step, savedOrder?.id, paymentStarted, orderStatus])

  const setField = (field: keyof SchoolOrder, value: string) => setOrder((current) => ({ ...current, [field]: value }))
  const setQuantity = (gradeCode: string, value: number) => setQuantities((current) => ({ ...current, [gradeCode]: Math.max(0, Math.min(10000, Math.floor(value || 0))) }))
  const phoneIsValid = (value: string) => /^(?:\+?254|0)(?:7|1)\d{8}$/.test(value.replace(/[\s-]/g, ''))
  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSubmitting(true)
    try {
      const response = await fetch('/api/public/guardian-exam-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...order, grades: lines.map(({ gradeCode, quantity }) => ({ gradeCode, quantity })) }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Could not prepare this order.')
      setSavedOrder(body.order); setOrderStatus(body.order.status); setMpesaPhone(order.phone); setStep('review')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare this order.') }
    finally { setSubmitting(false) }
  }
  const startPayment = async () => {
    if (!savedOrder) return
    if (!phoneIsValid(mpesaPhone)) { setError('Enter a valid Kenyan Safaricom number.'); return }
    setError(''); setSubmitting(true)
    try {
      const response = await fetch(`/api/public/guardian-exam-orders/${savedOrder.id}/mpesa/stk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: mpesaPhone }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Could not start M-PESA checkout.')
      setSavedOrder((current) => current ? { ...current, ...body.order } : current)
      setOrderStatus(body.order.status); setPaymentStarted(true); setStep('waiting')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start M-PESA checkout.') }
    finally { setSubmitting(false) }
  }
  const retryPayment = () => { setPaymentStarted(false); setOrderStatus('payment_failed'); setError(''); setStep('review') }

  return <main className="guardian-preorder-page">
    <section className="guardian-preorder-dialog" aria-labelledby="guardian-preorder-title">
      {step !== 'waiting' && <button className="guardian-preorder-close" onClick={onClose} aria-label="Back to Guardian Exams"><ArrowLeft size={19}/><span>Back to Guardian Exams</span></button>}
      <div className="guardian-preorder-heading"><span className="guardian-preorder-icon"><GraduationCap size={22}/></span><span className="guardian-preorder-step">{step === 'details' ? 'SCHOOL EXAM ORDER' : step === 'complete' ? 'ORDER CONFIRMED' : 'CHECKOUT'}</span><h2 id="guardian-preorder-title">{step === 'complete' ? 'Payment confirmed.' : 'Order Guardian Exams'}</h2><p>2027 Term 1 Midterm Exam · grade packs priced per student</p></div>

      {step === 'details' && <form className="guardian-preorder-form" onSubmit={createOrder}>
        <div className="guardian-preorder-fields">
          <label>School or institution<input required maxLength={160} value={order.school} onChange={(event) => setField('school', event.target.value)} placeholder="e.g. Greenfield Academy" autoComplete="organization"/></label>
          <label>Contact person<input required maxLength={120} value={order.contact} onChange={(event) => setField('contact', event.target.value)} placeholder="Full name" autoComplete="name"/></label>
          <label>Email address<input required type="email" maxLength={254} value={order.email} onChange={(event) => setField('email', event.target.value)} placeholder="name@school.ac.ke" autoComplete="email"/></label>
          <label>Contact phone<input required type="tel" value={order.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="0712 345 678" autoComplete="tel"/></label>
          <label>County<input required maxLength={100} value={order.county} onChange={(event) => setField('county', event.target.value)} placeholder="County" autoComplete="address-level1"/></label>
          <label>Town or sub-county<input required maxLength={100} value={order.town} onChange={(event) => setField('town', event.target.value)} placeholder="Town / sub-county" autoComplete="address-level2"/></label>
          <label className="guardian-preorder-wide">Delivery location<input required maxLength={300} value={order.address} onChange={(event) => setField('address', event.target.value)} placeholder="School street, landmark or delivery instructions" autoComplete="street-address"/></label>
        </div>
        <section className="guardian-grade-picker" aria-label="Choose grades and student quantities"><div className="guardian-grade-picker-heading"><div><strong>Which grades are you ordering for?</strong><small>Tick a grade, then enter how many students need its full paper pack.</small></div><span>{lines.length} grades · {totalStudents} students</span></div>
          {loadingPrices ? <p className="guardian-price-loading">Loading current grade prices…</p> : <div className="guardian-grade-list">{prices.map((grade) => <div className={`guardian-grade-row ${Number(quantities[grade.gradeCode]) > 0 ? 'is-selected' : ''}`} key={grade.gradeCode}><label><input type="checkbox" checked={Number(quantities[grade.gradeCode]) > 0} onChange={(event) => setQuantity(grade.gradeCode, event.target.checked ? 1 : 0)}/><strong>{grade.gradeLabel}</strong><small>{money(grade.unitPriceKes)} / student</small></label><div className="guardian-grade-quantity"><button type="button" aria-label={`Decrease ${grade.gradeLabel} quantity`} disabled={!quantities[grade.gradeCode]} onClick={() => setQuantity(grade.gradeCode, Number(quantities[grade.gradeCode]) - 1)}>−</button><input aria-label={`${grade.gradeLabel} student quantity`} type="number" min="0" max="10000" value={quantities[grade.gradeCode] || ''} placeholder="0" onChange={(event) => setQuantity(grade.gradeCode, Number(event.target.value))}/><button type="button" aria-label={`Increase ${grade.gradeLabel} quantity`} onClick={() => setQuantity(grade.gradeCode, Number(quantities[grade.gradeCode] || 0) + 1)}>+</button></div><b className="guardian-grade-subtotal">{money(Number(quantities[grade.gradeCode] || 0) * grade.unitPriceKes)}</b></div>)}</div>}
        </section>
        <div className="guardian-preorder-delivery"><span><Truck size={18}/></span><div><b>Delivery {money(deliveryFeeKes)}</b><small>One flat countrywide delivery fee per school order.</small></div></div>
        <div className="guardian-preorder-live-total"><span>{totalStudents} students across {lines.length} grades</span><strong>{money(totalKes)}</strong></div>
        {error && <small className="guardian-preorder-error" role="alert">{error}</small>}
        <button className="guardian-preorder-primary" type="submit" disabled={loadingPrices || !prices.length || !lines.length || submitting}>{submitting ? 'Preparing order…' : <>Review order · {money(totalKes)} <ArrowRight size={16}/></>}</button>
        <small className="guardian-preorder-disclaimer">The server recalculates prices and saves this order’s price snapshot before payment.</small>
      </form>}

      {step === 'review' && savedOrder && <div className="guardian-preorder-payment"><button className="guardian-preorder-back" onClick={() => setStep('details')}><ArrowLeft size={15}/> Edit school details and quantities</button>
        <div className="guardian-preorder-summary"><span><School size={17}/><b>{order.school}</b></span><span><MapPin size={16}/>{order.town}, {order.county}</span><div className="guardian-checkout-lines">{savedOrder.grades.map((line) => <span key={line.gradeCode}>{line.gradeLabel} · {line.quantity} students × {money(line.unitPriceKes)} <b>{money(line.subtotalKes)}</b></span>)}</div><span>{savedOrder.totalStudents} students across {savedOrder.grades.length} grades</span><span>Exam packs <b>{money(savedOrder.subtotalKes)}</b></span><span>Delivery <b>{money(savedOrder.deliveryFeeKes)}</b></span><strong><span>Total due</span><b>{money(savedOrder.totalKes)}</b></strong><small>Prices and delivery fee are saved with this order. Later price changes won’t affect it.</small></div>
        <div className="guardian-preorder-mpesa"><span className="guardian-preorder-mpesa-logo"><img src="/assets/mpesa-logo.svg" alt="M-PESA"/></span><div><b>Pay securely with M-PESA</b><small>A payment prompt will be sent to the phone you enter below.</small></div></div>
        <label className="guardian-preorder-phone-label" htmlFor="guardian-mpesa-phone">Safaricom phone number</label><div className={`guardian-preorder-phone ${error ? 'has-error' : ''}`}><span>KE +254</span><input id="guardian-mpesa-phone" type="tel" inputMode="tel" value={mpesaPhone} onChange={(event) => { setMpesaPhone(event.target.value); setError('') }} placeholder="712 345 678"/></div>
        {error && <small className="guardian-preorder-error" role="alert">{error}</small>}
        <button className="guardian-preorder-primary" disabled={submitting} onClick={() => void startPayment()}>{submitting ? 'Connecting to M-PESA…' : <>Pay {money(savedOrder.totalKes)} <ArrowRight size={16}/></>}</button>
        <small className="guardian-preorder-disclaimer">M-PESA checkout requires Guardian Exams payment credentials and callback configuration to be active.</small>
      </div>}

      {step === 'waiting' && <div className="guardian-preorder-payment"><div className="guardian-preorder-waiting"><span className="guardian-preorder-pulse"/><div><b>{orderStatus === 'payment_review' ? 'Payment needs a quick check' : 'Waiting for M-PESA confirmation'}</b><small>{orderStatus === 'payment_review' ? 'We received a callback that needs administrator review. Your order reference is below.' : `Approve the M-PESA prompt sent to ${mpesaPhone}. This page will update when the payment callback is confirmed.`}</small></div></div><div className="guardian-preorder-summary"><span>Order reference <b>{savedOrder?.id}</b></span><span>Total <b>{money(savedOrder?.totalKes || 0)}</b></span></div>{error && <small className="guardian-preorder-error" role="alert">{error}</small>}{orderStatus === 'payment_failed' && <button className="guardian-preorder-primary" onClick={retryPayment}>Try payment again <ArrowRight size={16}/></button>}</div>}

      {step === 'complete' && savedOrder && <div className="guardian-preorder-complete"><span className="guardian-preorder-success-icon"><Check size={26}/></span><p>Payment confirmed for <b>{order.school}</b>. Your school order is recorded.</p><div><span>Order</span><b>{savedOrder.id}</b><span>Students</span><b>{savedOrder.totalStudents} across {savedOrder.grades.length} grades</b><span>Exam packs</span><b>{money(savedOrder.subtotalKes)}</b><span>Delivery</span><b>{money(savedOrder.deliveryFeeKes)}</b><span>Paid</span><b>{money(savedOrder.totalKes)}</b><span>M-PESA receipt</span><b>{savedOrder.paymentReference || 'Confirmed'}</b></div><small>We’ve saved the grade quantities, delivery details and price breakdown with your order.</small><button className="guardian-preorder-primary" onClick={onClose}>Done <Check size={16}/></button></div>}
    </section>
  </main>
}
