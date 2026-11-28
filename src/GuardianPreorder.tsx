import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, MapPin, School, Search } from 'lucide-react'

type GradePrice = { gradeCode: string; gradeLabel: string; unitPriceKes: number }
type OrderLine = GradePrice & { quantity: number; subtotalKes: number }
type SchoolOrder = { school: string; contact: string; email: string; phone: string; county: string; town: string; address: string }
type SavedOrder = { id: string; status: string; grades: OrderLine[]; totalStudents: number; subtotalKes: number; deliveryFeeKes: number; totalKes: number; paymentReference?: string | null; paymentError?: string | null }
type MapSuggestion = { id: string; label: string }
type PickupSample = 'main-stage' | 'parcel-counter' | ''
const initialSchoolOrder: SchoolOrder = { school: '', contact: '', email: '', phone: '', county: '', town: '', address: '' }
const money = (value: number) => `KSh ${Number(value || 0).toLocaleString('en-KE')}`
const localKenyanPhoneDigits = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('254')) digits = digits.slice(3)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 9)
}
const formatKenyanPhone = (value: string) => {
  const digits = localKenyanPhoneDigits(value)
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join(' ')
}

export default function GuardianPreorder({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'grades' | 'delivery' | 'checkout' | 'waiting' | 'complete'>('grades')
  const [order, setOrder] = useState<SchoolOrder>(initialSchoolOrder)
  const [countyOptions, setCountyOptions] = useState<string[]>([])
  const [townOptions, setTownOptions] = useState<string[]>([])
  const [countySearchLoading, setCountySearchLoading] = useState(false)
  const [townSearchLoading, setTownSearchLoading] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<MapSuggestion[]>([])
  const [addressSearchLoading, setAddressSearchLoading] = useState(false)
  const [addressSearchMessage, setAddressSearchMessage] = useState('')
  const [pickupSample, setPickupSample] = useState<PickupSample>('')
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
  const liveTotalKes = subtotalKes + deliveryFeeKes
  const stageIndex = step === 'grades' ? 0 : step === 'delivery' ? 1 : 2

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
    if (step !== 'delivery') return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setCountySearchLoading(true)
      const query = new URLSearchParams({ type: 'counties', q: order.county })
      fetch(`/api/public/guardian-locations?${query}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body) => setCountyOptions(Array.isArray(body.results) ? body.results : []))
        .catch(() => { if (!controller.signal.aborted) setCountyOptions([]) })
        .finally(() => { if (!controller.signal.aborted) setCountySearchLoading(false) })
    }, 180)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [step, order.county])

  useEffect(() => {
    if (step !== 'delivery' || !order.county.trim()) { setTownOptions([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setTownSearchLoading(true)
      const query = new URLSearchParams({ type: 'towns', county: order.county, q: order.town })
      fetch(`/api/public/guardian-locations?${query}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body) => setTownOptions(Array.isArray(body.results) ? body.results : []))
        .catch(() => { if (!controller.signal.aborted) setTownOptions([]) })
        .finally(() => { if (!controller.signal.aborted) setTownSearchLoading(false) })
    }, 180)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [step, order.county, order.town])

  useEffect(() => {
    const queryText = order.address.trim()
    if (step !== 'delivery' || queryText.length < 3) {
      setAddressSuggestions([])
      setAddressSearchLoading(false)
      setAddressSearchMessage('')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setAddressSearchLoading(true)
      setAddressSearchMessage('')
      try {
        const scopedQuery = [queryText, order.town, order.county, 'Kenya'].filter(Boolean).join(', ')
        const query = new URLSearchParams({ q: scopedQuery, limit: '8', lang: 'en', lat: '-0.0236', lon: '37.9062' })
        const response = await fetch(`https://photon.komoot.io/api/?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Map search unavailable')
        const body = await response.json()
        const features = Array.isArray(body.features) ? body.features : []
        const matches = features.flatMap((feature: any, index: number) => {
          const place = feature?.properties || {}
          if (String(place.countrycode || '').toLowerCase() !== 'ke' && place.country !== 'Kenya') return []
          const localityContext = [place.city, place.town, place.village, place.district, place.county, place.state].filter(Boolean).join(' ').toLocaleLowerCase('en')
          if (order.town && !localityContext.includes(order.town.toLocaleLowerCase('en'))) return []
          if (order.county && !localityContext.includes(order.county.toLocaleLowerCase('en'))) return []
          const street = [place.housenumber, place.street].filter(Boolean).join(' ')
          const locality = place.city || place.town || place.village || place.district || place.county
          const label = [...new Set([place.name, street, locality, place.state].filter(Boolean).map(String))].join(', ')
          return label ? [{ id: String(feature?.properties?.osm_id || `${label}-${index}`), label }] : []
        })
        setAddressSuggestions(matches)
        setAddressSearchMessage(matches.length ? '' : 'No Kenyan map matches. You can still enter the address manually.')
      } catch {
        if (!controller.signal.aborted) {
          setAddressSuggestions([])
          setAddressSearchMessage('Map search is temporarily unavailable. You can still enter the address manually.')
        }
      } finally {
        if (!controller.signal.aborted) setAddressSearchLoading(false)
      }
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [step, order.address, order.town, order.county])

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
  const phoneIsValid = (value: string) => /^[17]\d{8}$/.test(localKenyanPhoneDigits(value))
  const startPayment = async () => {
    if (!savedOrder) return
    if (!phoneIsValid(mpesaPhone)) { setError('Enter a valid Kenyan Safaricom number.'); return }
    setError(''); setSubmitting(true)
    try {
      const response = await fetch(`/api/public/guardian-exam-orders/${savedOrder.id}/mpesa/stk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: `254${localKenyanPhoneDigits(mpesaPhone)}` }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Could not start M-PESA checkout.')
      setSavedOrder((current) => current ? { ...current, ...body.order } : current)
      setOrderStatus(body.order.status); setPaymentStarted(true); setStep('waiting')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start M-PESA checkout.') }
    finally { setSubmitting(false) }
  }
  const retryPayment = () => { setPaymentStarted(false); setOrderStatus('payment_failed'); setError(''); setStep('checkout') }
  const continueToCheckout = async () => {
    setError(''); setSubmitting(true)
    try {
      const pickupLabel = pickupSample === 'main-stage' ? `Sample pickup point: main bus/parcel stage, ${order.town}, ${order.county}` : pickupSample === 'parcel-counter' ? `Sample pickup point: town parcel counter, ${order.town}, ${order.county}` : ''
      const deliveryAddress = [pickupLabel, order.address.trim()].filter(Boolean).join(' — ')
      const response = await fetch('/api/public/guardian-exam-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...order, address: deliveryAddress, grades: lines.map(({ gradeCode, quantity }) => ({ gradeCode, quantity })) }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || body?.message || 'Could not prepare this order.')
      setSavedOrder(body.order); setOrderStatus(body.order.status); setMpesaPhone(formatKenyanPhone(order.phone)); setStep('checkout')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare this order.') }
    finally { setSubmitting(false) }
  }

  return <main className="guardian-preorder-page">
    <section className="guardian-preorder-dialog guardian-preorder-stage" key={step} aria-labelledby="guardian-preorder-title">
      {step !== 'waiting' && <button className="guardian-preorder-close" onClick={onClose} aria-label="Back to Guardian Exams"><ArrowLeft size={19}/><span>Back to Guardian Exams</span></button>}
      <div className="guardian-preorder-heading guardian-preorder-heading-compact"><span className="guardian-preorder-step">{step === 'complete' ? 'ORDER CONFIRMED' : 'GUARDIAN EXAMS · 2027 TERM 1 MIDTERM'}</span><h2 id="guardian-preorder-title">{step === 'complete' ? 'Payment confirmed.' : 'Pre-order'}</h2><p>{totalStudents} students · {lines.length} {lines.length === 1 ? 'grade' : 'grades'} selected · packs priced per student</p></div>
      {step !== 'waiting' && step !== 'complete' && <nav className="guardian-step-rail" aria-label="Order progress">{['Order Details','Personal & delivery details','Checkout'].map((label,index) => <div className={`guardian-step-rail-item ${index < stageIndex ? 'is-complete' : ''} ${index === stageIndex ? 'is-current' : ''}`} key={label}><span className="guardian-step-rail-marker">{index < stageIndex ? <Check size={15}/> : index + 1}</span><span>{label}</span></div>)}</nav>}

      {step === 'grades' && <div className="guardian-order-layout"><div className="guardian-preorder-form guardian-grade-form">
        <section className="guardian-grade-picker" aria-label="Choose grades and student quantities"><div className="guardian-grade-picker-heading"><div><strong>Which grades are you ordering for?</strong><small>Tick a grade, then enter how many students need its full paper pack.</small></div><div className="guardian-grade-picker-tools"><button type="button" className="guardian-select-all" disabled={loadingPrices || !prices.length} onClick={() => { const allSelected = lines.length === prices.length; setQuantities((current) => Object.fromEntries(prices.map((grade) => [grade.gradeCode, allSelected ? 0 : Math.max(1, Number(current[grade.gradeCode]) || 0)]))) }}>{lines.length === prices.length && prices.length ? 'Clear all' : 'Select all'}</button><span>{lines.length} grades · {totalStudents} students</span></div></div>
          {loadingPrices ? <p className="guardian-price-loading">Loading current grade prices…</p> : <div className="guardian-grade-list">{prices.map((grade) => <div className={`guardian-grade-row ${Number(quantities[grade.gradeCode]) > 0 ? 'is-selected' : ''}`} key={grade.gradeCode}><label><input type="checkbox" checked={Number(quantities[grade.gradeCode]) > 0} onChange={(event) => setQuantity(grade.gradeCode, event.target.checked ? 1 : 0)}/><strong>{grade.gradeLabel}</strong><small>{money(grade.unitPriceKes)} / student</small></label><div className="guardian-grade-quantity"><button type="button" aria-label={`Decrease ${grade.gradeLabel} quantity`} disabled={!quantities[grade.gradeCode]} onClick={() => setQuantity(grade.gradeCode, Number(quantities[grade.gradeCode]) - 1)}>−</button><input aria-label={`${grade.gradeLabel} student quantity`} type="number" min="0" max="10000" value={quantities[grade.gradeCode] || ''} placeholder="0" onChange={(event) => setQuantity(grade.gradeCode, Number(event.target.value))}/><button type="button" aria-label={`Increase ${grade.gradeLabel} quantity`} onClick={() => setQuantity(grade.gradeCode, Number(quantities[grade.gradeCode] || 0) + 1)}>+</button></div><b className="guardian-grade-subtotal">{money(Number(quantities[grade.gradeCode] || 0) * grade.unitPriceKes)}</b></div>)}</div>}
        </section>
        {error && <small className="guardian-preorder-error" role="alert">{error}</small>}
      </div><aside className="guardian-live-order-summary"><span className="guardian-live-summary-kicker">YOUR ORDER</span><h3>Order summary</h3><p>{totalStudents} students across {lines.length} {lines.length === 1 ? 'grade' : 'grades'}</p><div className="guardian-live-summary-lines">{lines.length ? lines.map((line) => <div key={line.gradeCode}><span>{line.gradeLabel}<small>{line.quantity} students × {money(line.unitPriceKes)}</small></span><b>{money(line.subtotalKes)}</b></div>) : <small className="guardian-summary-empty">Choose a grade and quantity to see your order here.</small>}</div><div className="guardian-live-summary-totals"><div><span>Exam packs</span><b>{money(subtotalKes)}</b></div><div><span>Delivery</span><b>{money(deliveryFeeKes)}</b></div><strong><span>Total</span><b aria-live="polite">{money(liveTotalKes)}</b></strong></div><button className="guardian-preorder-primary" disabled={loadingPrices || !prices.length || !lines.length} onClick={() => setStep('delivery')}>Continue <ArrowRight size={16}/></button><small className="guardian-live-summary-note">Final price is confirmed before payment.</small></aside></div>}

      {step === 'delivery' && <form className="guardian-preorder-form" onSubmit={(event) => { event.preventDefault(); void continueToCheckout() }}>
        <div className="guardian-preorder-fields">
          <label>School or institution<input required maxLength={160} value={order.school} onChange={(event) => setField('school', event.target.value)} placeholder="e.g. Greenfield Academy" autoComplete="organization"/></label>
          <label>Contact person<input required maxLength={120} value={order.contact} onChange={(event) => setField('contact', event.target.value)} placeholder="Full name" autoComplete="name"/></label>
          <label>Email address<input required type="email" maxLength={254} value={order.email} onChange={(event) => setField('email', event.target.value)} placeholder="name@school.ac.ke" autoComplete="email"/></label>
          <label>Contact phone<input required type="tel" value={order.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="0712 345 678" autoComplete="tel"/></label>
          <label>County<span className="guardian-location-field"><Search size={15}/><input required maxLength={100} list="guardian-county-options" value={order.county} onChange={(event) => { if (event.target.value !== order.county) { setField('town', ''); setPickupSample('') } setField('county', event.target.value) }} placeholder="Search Kenyan counties" autoComplete="address-level1" aria-label="Search Kenyan counties"/><datalist id="guardian-county-options">{countyOptions.map((county) => <option key={county} value={county}/>)}</datalist><small aria-live="polite">{countySearchLoading ? 'Searching…' : 'Kenya · 47 counties'}</small></span></label>
          <label>Town or sub-county<span className="guardian-location-field"><Search size={15}/><input required maxLength={100} list="guardian-town-options" value={order.town} onChange={(event) => { if (event.target.value !== order.town) setPickupSample(''); setField('town', event.target.value) }} placeholder={order.county ? 'Search towns in county' : 'Choose a county first'} autoComplete="address-level2" aria-label="Search towns and sub-counties" disabled={!order.county}/><datalist id="guardian-town-options">{townOptions.map((town) => <option key={town} value={town}/>)}</datalist><small aria-live="polite">{townSearchLoading ? 'Searching…' : order.county ? 'Suggested towns update as you type' : 'Select a county to see towns'}</small></span></label>
          <fieldset className="guardian-pickup-samples guardian-preorder-wide" disabled={!order.town.trim()}><legend>Choose a pickup point in {order.town || 'your town'}</legend><p>Sample choices to preview checkout. We’ll confirm the exact collection point before dispatch.</p><label className={pickupSample === 'main-stage' ? 'is-selected' : ''}><input type="radio" name="guardian-pickup-sample" checked={pickupSample === 'main-stage'} onChange={() => setPickupSample('main-stage')}/><MapPin size={16}/><span><strong>Main bus and parcel stage</strong><small>{order.town || 'Selected town'} town centre · sample point</small></span></label><label className={pickupSample === 'parcel-counter' ? 'is-selected' : ''}><input type="radio" name="guardian-pickup-sample" checked={pickupSample === 'parcel-counter'} onChange={() => setPickupSample('parcel-counter')}/><MapPin size={16}/><span><strong>Town parcel counter</strong><small>{order.town || 'Selected town'} · sample point</small></span></label></fieldset>
          <label className="guardian-preorder-wide">{pickupSample ? 'Extra pickup directions (optional)' : `Delivery location in ${order.town || 'your selected town'}`}<span className="guardian-address-autocomplete"><input required={!pickupSample} maxLength={300} value={order.address} onChange={(event) => setField('address', event.target.value)} placeholder={pickupSample ? 'Optional: add a specific stage, landmark or directions' : `Search a street, building or landmark in ${order.town || 'your town'}`} autoComplete="street-address" aria-autocomplete="list" aria-controls="guardian-address-suggestions" aria-expanded={addressSuggestions.length > 0}/>{(addressSearchLoading || addressSuggestions.length > 0 || addressSearchMessage) && <div className="guardian-address-suggestions" id="guardian-address-suggestions" role="listbox" aria-label={`Address suggestions in ${order.town || 'selected town'}`}>{addressSearchLoading && <small className="guardian-address-status" aria-live="polite">Searching in {order.town || order.county}…</small>}{addressSuggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.id} onClick={() => { setField('address', suggestion.label); setAddressSuggestions([]); setAddressSearchMessage('') }}><MapPin size={15}/><span>{suggestion.label}</span></button>)}{!addressSearchLoading && addressSearchMessage && <small className="guardian-address-status" aria-live="polite">{addressSearchMessage}</small>}</div>}{!pickupSample && <small className="guardian-map-attribution">Map suggestions by Photon · © OpenStreetMap contributors</small>}</span></label>
          <aside className="guardian-routing-note"><MapPin size={17}/><span><strong>Collection points</strong><small>We’re adding collection points for {order.town || 'your town'}. Keep checking back for updates.</small></span></aside>
        </div>
        {error && <small className="guardian-preorder-error" role="alert">{error}</small>}
        <div className="guardian-preorder-actions"><button type="button" className="guardian-preorder-secondary" onClick={() => { setError(''); setStep('grades') }}><ArrowLeft size={16}/> Back to grades</button><button className="guardian-preorder-primary" type="submit" disabled={submitting}>{submitting ? 'Preparing checkout…' : <>Continue to checkout <ArrowRight size={16}/></>}</button></div>
      </form>}

      {step === 'checkout' && savedOrder && <div className="guardian-checkout-layout"><div className="guardian-preorder-payment"><button className="guardian-preorder-back" onClick={() => { setError(''); setStep('delivery') }}><ArrowLeft size={15}/> Edit personal & delivery details</button>
        <div className="guardian-preorder-mpesa"><span className="guardian-preorder-mpesa-logo"><img src="/assets/mpesa-logo.svg" alt="M-PESA"/></span><div><b>Pay securely with M-PESA</b><small>A payment prompt will be sent to the phone you enter below.</small></div></div>
        <label className="guardian-preorder-phone-label" htmlFor="guardian-mpesa-phone">Safaricom phone number</label><div className={`guardian-preorder-phone ${error ? 'has-error' : ''}`}><span>KE +254</span><input id="guardian-mpesa-phone" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={11} value={mpesaPhone} onChange={(event) => { setMpesaPhone(formatKenyanPhone(event.target.value)); setError('') }} placeholder="712 345 678" aria-describedby="guardian-mpesa-phone-hint"/></div><small id="guardian-mpesa-phone-hint" className="guardian-phone-hint">Enter 07… or 01… number. +254 is added automatically.</small>
        {error && <small className="guardian-preorder-error" role="alert">{error}</small>}
        <button className="guardian-preorder-primary" disabled={submitting} onClick={() => void startPayment()}>{submitting ? 'Connecting to M-PESA…' : <>Pay {money(savedOrder.totalKes)} <ArrowRight size={16}/></>}</button>
        <small className="guardian-preorder-disclaimer">M-PESA checkout requires Guardian Exams payment credentials and callback configuration to be active.</small>
      </div><aside className="guardian-checkout-sidebar"><h3>Order summary</h3><div className="guardian-preorder-summary"><span><School size={17}/><b>{order.school}</b></span><span><MapPin size={16}/>{order.town}, {order.county}{pickupSample ? ` · ${pickupSample === 'main-stage' ? 'Main bus/parcel stage (sample)' : 'Town parcel counter (sample)'}` : ''}</span><div className="guardian-checkout-lines">{savedOrder.grades.map((line) => <span key={line.gradeCode}>{line.gradeLabel} · {line.quantity} students × {money(line.unitPriceKes)} <b>{money(line.subtotalKes)}</b></span>)}</div><span>{savedOrder.totalStudents} students across {savedOrder.grades.length} grades</span><span>Exam packs <b>{money(savedOrder.subtotalKes)}</b></span><span>Delivery <b>{money(savedOrder.deliveryFeeKes)}</b></span><strong><span>Total due</span><b>{money(savedOrder.totalKes)}</b></strong><small>Prices and delivery fee are saved with this order. Later price changes won’t affect it.</small></div></aside></div>}

      {step === 'waiting' && <div className="guardian-preorder-payment"><div className="guardian-preorder-waiting"><span className="guardian-preorder-pulse"/><div><b>{orderStatus === 'payment_review' ? 'Payment needs a quick check' : 'Waiting for M-PESA confirmation'}</b><small>{orderStatus === 'payment_review' ? 'We received a callback that needs administrator review. Your order reference is below.' : `Approve the M-PESA prompt sent to ${mpesaPhone}. This page will update when the payment callback is confirmed.`}</small></div></div><div className="guardian-preorder-summary"><span>Order reference <b>{savedOrder?.id}</b></span><span>Total <b>{money(savedOrder?.totalKes || 0)}</b></span></div>{error && <small className="guardian-preorder-error" role="alert">{error}</small>}{orderStatus === 'payment_failed' && <button className="guardian-preorder-primary" onClick={retryPayment}>Try payment again <ArrowRight size={16}/></button>}</div>}

      {step === 'complete' && savedOrder && <div className="guardian-preorder-complete"><span className="guardian-preorder-success-icon"><Check size={26}/></span><p>Payment confirmed for <b>{order.school}</b>. Your school order is recorded.</p><div><span>Order</span><b>{savedOrder.id}</b><span>Students</span><b>{savedOrder.totalStudents} across {savedOrder.grades.length} grades</b><span>Exam packs</span><b>{money(savedOrder.subtotalKes)}</b><span>Delivery</span><b>{money(savedOrder.deliveryFeeKes)}</b><span>Paid</span><b>{money(savedOrder.totalKes)}</b><span>M-PESA receipt</span><b>{savedOrder.paymentReference || 'Confirmed'}</b></div><small>We’ve saved the grade quantities, delivery details and price breakdown with your order.</small><button className="guardian-preorder-primary" onClick={onClose}>Done <Check size={16}/></button></div>}
    </section>
  </main>
}
