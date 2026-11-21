import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, GraduationCap, MapPin, School, Truck, X } from 'lucide-react'

type SchoolOrder = {
  school: string
  contact: string
  email: string
  phone: string
  county: string
  town: string
  address: string
  copies: number
}

export default function GuardianPreorder({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'details' | 'payment' | 'waiting' | 'complete'>('details')
  const [order, setOrder] = useState<SchoolOrder>({ school: '', contact: '', email: '', phone: '', county: '', town: '', address: '', copies: 1 })
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [error, setError] = useState('')
  const setField = (field: keyof SchoolOrder, value: string | number) => setOrder((current) => ({ ...current, [field]: value }))
  const phoneIsValid = (value: string) => /^(?:\+?254|0)(?:7|1)\d{8}$/.test(value.replace(/[\s-]/g, ''))
  const saveOrder = () => {
    const reference = `GE-${Date.now().toString().slice(-7)}`
    const saved = { ...order, reference, series: '2027 Term 1 Midterm Exam', deliveryFee: 300, createdAt: new Date().toISOString(), status: 'Delivery fee simulated' }
    try {
      const existing = JSON.parse(localStorage.getItem('guardian-school-preorders') || '[]') as typeof saved[]
      localStorage.setItem('guardian-school-preorders', JSON.stringify([saved, ...existing]))
    } catch {
      localStorage.setItem('guardian-school-preorders', JSON.stringify([saved]))
    }
    setStep('complete')
  }

  return <div className="guardian-preorder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="guardian-preorder-dialog" role="dialog" aria-modal="true" aria-labelledby="guardian-preorder-title">
      <button className="guardian-preorder-close" onClick={onClose} aria-label="Close preorder"><X size={19}/></button>
      <div className="guardian-preorder-heading"><span className="guardian-preorder-icon"><GraduationCap size={22}/></span><span className="guardian-preorder-step">{step === 'details' ? 'SCHOOL PRE-ORDER' : step === 'complete' ? 'REQUEST RECEIVED' : 'M-PESA CHECKOUT'}</span><h2 id="guardian-preorder-title">{step === 'complete' ? 'Your school is on the list.' : 'Pre-order Guardian Exams'}</h2><p>2027 Term 1 Midterm Exam · nationwide school delivery</p></div>

      {step === 'details' && <form className="guardian-preorder-form" onSubmit={(event) => { event.preventDefault(); setError(''); setMpesaPhone(order.phone); setStep('payment') }}>
        <div className="guardian-preorder-fields">
          <label>School or institution name<input required value={order.school} onChange={(event) => setField('school', event.target.value)} placeholder="e.g. Greenfield Academy" autoComplete="organization"/></label>
          <label>Contact person<input required value={order.contact} onChange={(event) => setField('contact', event.target.value)} placeholder="Full name" autoComplete="name"/></label>
          <label>Email address<input required type="email" value={order.email} onChange={(event) => setField('email', event.target.value)} placeholder="name@school.ac.ke" autoComplete="email"/></label>
          <label>Contact phone<input required type="tel" value={order.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="0712 345 678" autoComplete="tel"/></label>
          <label>County<input required value={order.county} onChange={(event) => setField('county', event.target.value)} placeholder="County" autoComplete="address-level1"/></label>
          <label>Town or sub-county<input required value={order.town} onChange={(event) => setField('town', event.target.value)} placeholder="Town / sub-county" autoComplete="address-level2"/></label>
          <label className="guardian-preorder-wide">Delivery location<input required value={order.address} onChange={(event) => setField('address', event.target.value)} placeholder="School street, landmark or delivery instructions" autoComplete="street-address"/></label>
          <label>Estimated copies<select value={order.copies} onChange={(event) => setField('copies', Number(event.target.value))}><option value={1}>1 copy</option><option value={5}>2–5 copies</option><option value={10}>6–10 copies</option><option value={25}>11–25 copies</option><option value={50}>26–50 copies</option><option value={100}>More than 50</option></select></label>
        </div>
        <div className="guardian-preorder-delivery"><span><Truck size={18}/></span><div><b>KSh 300 delivery countrywide</b><small>One flat delivery fee per school order. Exact book pricing will be shared before the exam order is confirmed.</small></div></div>
        <button className="guardian-preorder-primary" type="submit">Continue to M-Pesa <ArrowRight size={16}/></button>
        <small className="guardian-preorder-disclaimer">Prototype only. Your details are stored in this browser; no request is sent to a school or delivery service.</small>
      </form>}

      {step === 'payment' && <div className="guardian-preorder-payment">
        <button className="guardian-preorder-back" onClick={() => setStep('details')}><ArrowLeft size={15}/> Edit school details</button>
        <div className="guardian-preorder-summary"><span><School size={17}/><b>{order.school}</b></span><span><MapPin size={16}/>{order.town}, {order.county}</span><span><GraduationCap size={16}/>{order.copies} estimated copies · 2027 Term 1 Midterm Exam</span><strong><span>Nationwide delivery reservation</span><b>KSh 300</b></strong><small>Book price is pending release and is not included in this demo checkout.</small></div>
        <div className="guardian-preorder-mpesa"><span className="guardian-preorder-mpesa-logo"><img src="/assets/mpesa-logo.svg" alt="M-PESA"/></span><div><b>Pay delivery reservation with M-PESA</b><small>Simulated STK push · no real payment</small></div></div>
        {step === 'payment' && <><label className="guardian-preorder-phone-label" htmlFor="guardian-mpesa-phone">Safaricom phone number</label><div className={`guardian-preorder-phone ${error ? 'has-error' : ''}`}><span>KE +254</span><input id="guardian-mpesa-phone" type="tel" inputMode="tel" value={mpesaPhone} onChange={(event) => { setMpesaPhone(event.target.value); setError('') }} placeholder="712 345 678"/></div>{error && <small className="guardian-preorder-error" role="alert">{error}</small>}<button className="guardian-preorder-primary" onClick={() => { if (!phoneIsValid(mpesaPhone)) { setError('Enter a valid Kenyan mobile number to continue.') } else { setError(''); setStep('waiting') } }}>Request KSh 300 demo prompt <ArrowRight size={16}/></button><small className="guardian-preorder-disclaimer">Demo only. This does not contact M-PESA or transfer money.</small></>}
      </div>}

      {step === 'waiting' && <div className="guardian-preorder-payment"><div className="guardian-preorder-waiting"><span className="guardian-preorder-pulse"/><div><b>Waiting for M-PESA confirmation</b><small>Demo prompt sent to {mpesaPhone}. Choose below to simulate confirmation of the KSh 300 delivery reservation.</small></div></div><button className="guardian-preorder-primary" onClick={saveOrder}>Simulate successful payment <Check size={16}/></button><button className="guardian-preorder-back" onClick={() => setStep('payment')}><ArrowLeft size={15}/> Use a different number</button><small className="guardian-preorder-disclaimer">No real payment is processed.</small></div>}

      {step === 'complete' && <div className="guardian-preorder-complete"><span className="guardian-preorder-success-icon"><Check size={26}/></span><p>We’ve saved the school’s pre-order request for <b>{order.school}</b>.</p><div><span>Series</span><b>2027 Term 1 Midterm Exam</b><span>Delivery</span><b>{order.town}, {order.county}</b><span>Estimated quantity</span><b>{order.copies} copies</b><span>Delivery reservation</span><b>KSh 300 · simulated</b></div><small>Book pricing and release details still need confirmation. This prototype has not charged M-PESA or sent your details outside this device.</small><button className="guardian-preorder-primary" onClick={onClose}>Done <Check size={16}/></button></div>}
    </section>
  </div>
}
