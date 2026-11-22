import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react'
import './connected-integrations.css'

type Integration = { provider: string; ready: boolean; environment?: string; callbackReady?: boolean }
type IntegrationState = { email: Integration; sms: Integration; mpesa: Integration }
type PaymentReviewOrder = { id: string; totalKes: number | string; payerPhone: string | null; paymentError: string | null; createdAt: string; checkoutRequestId: string | null; buyerName: string; buyerEmail: string | null }

export default function ConnectedIntegrations() {
  const [integrations, setIntegrations] = useState<IntegrationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<PaymentReviewOrder[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [receipts, setReceipts] = useState<Record<string, string>>({})
  const [reviewBusy, setReviewBusy] = useState('')
  const [reviewMessage, setReviewMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [statusResponse, reviewResponse] = await Promise.all([
        fetch('/api/admin/integrations', { credentials: 'include' }),
        fetch('/api/admin/marketplace-payment-reviews', { credentials: 'include' }),
      ])
      const [statusBody, reviewBody] = await Promise.all([statusResponse.json(), reviewResponse.json()]) as [
        { integrations?: IntegrationState; error?: { message?: string } },
        { orders?: PaymentReviewOrder[]; error?: { message?: string } },
      ]
      if (!statusResponse.ok || !statusBody.integrations) throw new Error(statusBody.error?.message || 'Could not load integration status.')
      if (!reviewResponse.ok) throw new Error(reviewBody.error?.message || 'Could not load the payment review queue.')
      setIntegrations(statusBody.integrations)
      setOrders(reviewBody.orders || [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load integration status.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const resolvePayment = async (order: PaymentReviewOrder, decision: 'paid' | 'failed') => {
    setReviewBusy(order.id); setReviewMessage(''); setError('')
    try {
      const response = await fetch(`/api/admin/marketplace-payment-reviews/${encodeURIComponent(order.id)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: notes[order.id] || '', receipt: receipts[order.id] || '' }),
      })
      const body = await response.json() as { message?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Could not resolve payment review.')
      setReviewMessage(body.message || 'Payment review recorded.')
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not resolve payment review.') }
    finally { setReviewBusy('') }
  }

  const status = (ready: boolean) => ready
    ? <span className="integration-status ready"><CheckCircle2 size={15}/> Ready</span>
    : <span className="integration-status pending"><CircleAlert size={15}/> Needs setup</span>

  return <section className="connected-integrations">
    <header><div><span className="ws-kicker">PLATFORM CONNECTIONS</span><h2>Payments and messaging</h2><p>Provider credentials stay in server environment settings. This page only shows readiness.</p></div><button className="ws-button ws-light" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></header>
    {error && <p className="integration-error" role="alert">{error}</p>}
    {loading && !integrations ? <p className="integration-loading">Loading server configuration…</p> : integrations && <div className="integration-grid">
      <article><span className="integration-icon resend">R</span><div><strong>Resend email</strong><p>{integrations.email.provider} · account verification and password reset</p>{status(integrations.email.ready)}</div></article>
      <article><span className="integration-icon sms">SMS</span><div><strong>SMS delivery</strong><p>{integrations.sms.provider} · verification codes, password resets and M-PESA receipts</p>{status(integrations.sms.ready)}<small>Set the approved MobileSasa sender ID on the server.</small></div></article>
      <article><span className="integration-icon mpesa">M</span><div><strong>Safaricom M-PESA</strong><p>{integrations.mpesa.provider} · {integrations.mpesa.environment}</p>{status(integrations.mpesa.ready)}<small>Callback URL {integrations.mpesa.callbackReady ? 'configured' : 'not configured'}</small></div></article>
    </div>}
    <section className="payment-review-queue"><div><span className="ws-kicker">CALLBACK RECONCILIATION</span><h3>Payments needing review <b>{orders.length}</b></h3><p>Confirm these only after matching the amount, phone number and receipt against the Safaricom record.</p></div>{reviewMessage && <p className="integration-success" role="status">{reviewMessage}</p>}{orders.length === 0 ? <div className="payment-review-empty">No payment callback mismatches are waiting for review.</div> : orders.map((order) => <article key={order.id} className="payment-review-order"><div className="payment-review-summary"><strong>{order.buyerName}</strong><span>{order.buyerEmail || 'No email on account'} · {order.payerPhone || 'Phone unavailable'}</span><b>KSh {Number(order.totalKes).toLocaleString('en-KE')}</b><small>Order {order.id} · Checkout {order.checkoutRequestId || 'reference unavailable'}</small><small>{order.paymentError}</small></div><div className="payment-review-fields"><label>Verified M-PESA receipt<input value={receipts[order.id] || ''} onChange={(event) => setReceipts((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Required to confirm paid"/></label><label>Reconciliation note<textarea rows={2} value={notes[order.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Record what you checked"/></label><button className="ws-button ws-primary" onClick={() => void resolvePayment(order, 'paid')} disabled={Boolean(reviewBusy)}>{reviewBusy === order.id ? 'Saving…' : 'Confirm verified payment'}</button><button className="ws-button ws-light" onClick={() => void resolvePayment(order, 'failed')} disabled={Boolean(reviewBusy)}>Mark payment unsuccessful</button></div></article>)}</section>
    <div className="integration-note"><ShieldCheck size={17}/><span><strong>Credentials are not shown here.</strong><small>Configure the keys on the server. Use Daraja sandbox first, and switch to production only after callback reconciliation is accepted.</small></span></div>
  </section>
}
