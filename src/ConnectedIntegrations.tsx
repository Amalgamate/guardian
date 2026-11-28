import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import './connected-integrations.css'

type Integration = { provider: string; ready: boolean; environment?: string; callbackReady?: boolean; configured?: boolean; credentialsSaved?: boolean; credentialStorageReady?: boolean }
type IntegrationState = { email: Integration; sms: Integration; mpesa: Integration }
type PaymentReviewOrder = { id: string; totalKes: number | string; payerPhone: string | null; paymentError: string | null; createdAt: string; checkoutRequestId: string | null; buyerName: string; buyerEmail: string | null }
type MpesaForm = { environment: 'sandbox' | 'production'; consumerKey: string; consumerSecret: string; shortcode: string; passkey: string; callbackUrl: string; callbackSecret: string }
const blankMpesaForm: MpesaForm = { environment: 'sandbox', consumerKey: '', consumerSecret: '', shortcode: '', passkey: '', callbackUrl: '', callbackSecret: '' }

export default function ConnectedIntegrations() {
  const [integrations, setIntegrations] = useState<IntegrationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<PaymentReviewOrder[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [receipts, setReceipts] = useState<Record<string, string>>({})
  const [reviewBusy, setReviewBusy] = useState('')
  const [reviewMessage, setReviewMessage] = useState('')
  const [mpesaForm, setMpesaForm] = useState<MpesaForm>(() => ({ ...blankMpesaForm, callbackUrl: typeof window !== 'undefined' && window.location.protocol === 'https:' ? `${window.location.origin}/api/mpesa/callback` : '' }))
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [credentialMessage, setCredentialMessage] = useState('')
  const [confirmProduction, setConfirmProduction] = useState(false)
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
      if (statusBody.integrations.mpesa.environment === 'sandbox' || statusBody.integrations.mpesa.environment === 'production') setMpesaForm((current) => ({ ...current, environment: statusBody.integrations!.mpesa.environment as 'sandbox' | 'production' }))
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

  const saveMpesaCredentials = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSavingCredentials(true); setError(''); setCredentialMessage('')
    try {
      const response = await fetch('/api/admin/integrations/mpesa', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mpesaForm, confirmProduction }),
      })
      const body = await response.json() as { message?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message || 'Could not save M-PESA credentials.')
      setCredentialMessage(body.message || 'M-PESA credentials saved securely.')
      setMpesaForm((current) => ({ ...blankMpesaForm, environment: current.environment, callbackUrl: current.callbackUrl }))
      setConfirmProduction(false)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save M-PESA credentials.') }
    finally { setSavingCredentials(false) }
  }

  const status = (ready: boolean) => ready
    ? <span className="integration-status ready"><CheckCircle2 size={15}/> Ready</span>
    : <span className="integration-status pending"><CircleAlert size={15}/> Needs setup</span>

  return <section className="connected-integrations">
    <header><div><span className="ws-kicker">PLATFORM CONNECTIONS</span><h2>Payments and messaging</h2><p>Manage provider access securely and check integration readiness.</p></div><button className="ws-button ws-light" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></header>
    {error && <p className="integration-error" role="alert">{error}</p>}
    {loading && !integrations ? <p className="integration-loading">Loading server configuration…</p> : integrations && <div className="integration-grid">
      <article><span className="integration-icon resend">R</span><div><strong>Resend email</strong><p>{integrations.email.provider} · account verification and password reset</p>{status(integrations.email.ready)}</div></article>
      <article><span className="integration-icon sms">SMS</span><div><strong>SMS delivery</strong><p>{integrations.sms.provider} · verification codes, password resets and M-PESA receipts</p>{status(integrations.sms.ready)}<small>Set the approved MobileSasa sender ID on the server.</small></div></article>
      <article><span className="integration-icon mpesa">M</span><div><strong>Safaricom M-PESA</strong><p>{integrations.mpesa.provider} · {integrations.mpesa.environment}</p>{status(integrations.mpesa.ready)}<small>Callback URL {integrations.mpesa.callbackReady ? 'configured' : 'not configured'}</small></div></article>
    </div>}
    {integrations && <section className="integration-credentials"><div className="integration-credentials-heading"><div><span className="integration-credentials-icon"><KeyRound size={17}/></span><div><h3>Safaricom Daraja credentials</h3><p>{integrations.mpesa.credentialsSaved ? 'Encrypted credentials are saved on the Guardian Exams server. Secret values are never returned to this page.' : 'Add your Daraja app and shortcode details here. Use sandbox while validating checkout.'}</p></div></div><span className={`integration-status ${integrations.mpesa.ready ? 'ready' : 'pending'}`}>{integrations.mpesa.ready ? 'Ready' : 'Needs setup'}</span></div>
      {!integrations.mpesa.credentialStorageReady && <p className="integration-error" role="alert">Secure storage is unavailable. Ask the server administrator to set a stable AUTH_OTP_PEPPER of at least 32 characters before saving credentials.</p>}
      {credentialMessage && <p className="integration-success" role="status"><CheckCircle2 size={15}/>{credentialMessage}</p>}
      <form className="integration-credential-form" onSubmit={(event) => void saveMpesaCredentials(event)}>
        <label>Daraja environment<select value={mpesaForm.environment} onChange={(event) => { const environment = event.target.value as MpesaForm['environment']; setMpesaForm((current) => ({ ...current, environment })); setConfirmProduction(false) }}><option value="sandbox">Sandbox · test payments</option><option value="production">Production · real payments</option></select></label>
        <label>Consumer key<input type="password" autoComplete="new-password" value={mpesaForm.consumerKey} onChange={(event) => setMpesaForm((current) => ({ ...current, consumerKey: event.target.value }))} placeholder="Required for first setup · blank keeps saved value"/></label>
        <label>Consumer secret<input type="password" autoComplete="new-password" value={mpesaForm.consumerSecret} onChange={(event) => setMpesaForm((current) => ({ ...current, consumerSecret: event.target.value }))} placeholder="Required for first setup · blank keeps saved value"/></label>
        <label>Business shortcode<input inputMode="numeric" autoComplete="off" value={mpesaForm.shortcode} onChange={(event) => setMpesaForm((current) => ({ ...current, shortcode: event.target.value }))} placeholder="Sandbox shortcode or your live shortcode"/></label>
        <label>Lipa na M-PESA passkey<input type="password" autoComplete="new-password" value={mpesaForm.passkey} onChange={(event) => setMpesaForm((current) => ({ ...current, passkey: event.target.value }))} placeholder="Required for first setup · blank keeps saved value"/></label>
        <label>Public HTTPS callback URL<input type="url" required value={mpesaForm.callbackUrl} onChange={(event) => setMpesaForm((current) => ({ ...current, callbackUrl: event.target.value }))} placeholder="https://guardianexams.trendscore.co.ke/api/mpesa/callback"/><small>Must end in /api/mpesa/callback and be reachable by Safaricom.</small></label>
        <label>Callback secret<span className="integration-secret-control"><input type="password" autoComplete="new-password" value={mpesaForm.callbackSecret} onChange={(event) => setMpesaForm((current) => ({ ...current, callbackSecret: event.target.value }))} placeholder="Generate one or enter your own"/><button type="button" className="ws-button ws-light" onClick={() => { const bytes = window.crypto.getRandomValues(new Uint8Array(32)); const secret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); setMpesaForm((current) => ({ ...current, callbackSecret: secret })); setError(''); setCredentialMessage('A new callback secret was generated. Save the settings to activate it.') }}>Generate</button></span><small>Creates a unique 64-character secret using your browser’s secure random generator. It is added to the callback path.</small></label>
        {mpesaForm.environment === 'production' && <label className="integration-production-confirm"><input type="checkbox" checked={confirmProduction} onChange={(event) => setConfirmProduction(event.target.checked)}/><span><strong>Enable live payments</strong><small>Real customer payments can be initiated with these credentials.</small></span></label>}
        {error && <p className="integration-error integration-form-error" role="alert">{error}</p>}
        <div className="integration-credential-actions"><small>Secrets are encrypted in the database using the server’s stable AUTH_OTP_PEPPER. Blank secret fields keep their current values.</small><button className="ws-button ws-primary" type="submit" disabled={savingCredentials || !integrations.mpesa.credentialStorageReady || (mpesaForm.environment === 'production' && !confirmProduction)}><Save size={15}/>{savingCredentials ? 'Saving securely…' : 'Save M-PESA settings'}</button></div>
      </form>
    </section>}
    <section className="payment-review-queue"><div><span className="ws-kicker">CALLBACK RECONCILIATION</span><h3>Payments needing review <b>{orders.length}</b></h3><p>Confirm these only after matching the amount, phone number and receipt against the Safaricom record.</p></div>{reviewMessage && <p className="integration-success" role="status">{reviewMessage}</p>}{orders.length === 0 ? <div className="payment-review-empty">No payment callback mismatches are waiting for review.</div> : orders.map((order) => <article key={order.id} className="payment-review-order"><div className="payment-review-summary"><strong>{order.buyerName}</strong><span>{order.buyerEmail || 'No email on account'} · {order.payerPhone || 'Phone unavailable'}</span><b>KSh {Number(order.totalKes).toLocaleString('en-KE')}</b><small>Order {order.id} · Checkout {order.checkoutRequestId || 'reference unavailable'}</small><small>{order.paymentError}</small></div><div className="payment-review-fields"><label>Verified M-PESA receipt<input value={receipts[order.id] || ''} onChange={(event) => setReceipts((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Required to confirm paid"/></label><label>Reconciliation note<textarea rows={2} value={notes[order.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Record what you checked"/></label><button className="ws-button ws-primary" onClick={() => void resolvePayment(order, 'paid')} disabled={Boolean(reviewBusy)}>{reviewBusy === order.id ? 'Saving…' : 'Confirm verified payment'}</button><button className="ws-button ws-light" onClick={() => void resolvePayment(order, 'failed')} disabled={Boolean(reviewBusy)}>Mark payment unsuccessful</button></div></article>)}</section>
    <div className="integration-note"><ShieldCheck size={17}/><span><strong>Protect payment access.</strong><small>Start with sandbox credentials. Use production only after you have verified callbacks and reconciled a complete test payment. Secret values cannot be viewed after saving.</small></span></div>
  </section>
}
