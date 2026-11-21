import { useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Banknote, Check, CircleAlert, CircleCheck, Clock3, CreditCard, FileText, Info, WalletCards } from 'lucide-react'
import './teacher-wallet.css'

export type TeacherWithdrawalStatus = 'Pending admin approval' | 'Approved' | 'Rejected' | 'Paid'
export type TeacherWithdrawalRequest = {
  id: string
  teacherName: string
  amount: number
  method: 'M-PESA' | 'Bank transfer'
  account: string
  requestedAt: string
  status: TeacherWithdrawalStatus
  adminNote?: string
}
export type TeacherSale = {
  id: string
  paperTitle: string
  purchasedAt: string
  grossAmount: number
  platformFee: number
  netAmount: number
  status: 'Pending settlement' | 'Settled to wallet'
}

const withdrawalStorageKey = 'examify-withdrawal-requests'
const salesStorageKey = 'examify-teacher-sales'
const demoSales: TeacherSale[] = [
  { id: 'SALE-2048', paperTitle: 'Grade 8 Mathematics · Term 2 Review Paper', purchasedAt: 'Today · 10:24', grossAmount: 150, platformFee: 30, netAmount: 120, status: 'Settled to wallet' },
  { id: 'SALE-2042', paperTitle: 'Grade 7 Mathematics · Fractions Practice', purchasedAt: 'Yesterday · 16:10', grossAmount: 120, platformFee: 24, netAmount: 96, status: 'Settled to wallet' },
  { id: 'SALE-2031', paperTitle: 'Grade 8 Mathematics · Revision Pack', purchasedAt: '21 Nov · 11:05', grossAmount: 200, platformFee: 40, netAmount: 160, status: 'Pending settlement' },
]

export function readTeacherWithdrawals(): TeacherWithdrawalRequest[] {
  try {
    const items = JSON.parse(localStorage.getItem(withdrawalStorageKey) || '[]') as TeacherWithdrawalRequest[]
    return Array.isArray(items) ? items : []
  } catch { return [] }
}

export function saveTeacherWithdrawals(items: TeacherWithdrawalRequest[]) {
  localStorage.setItem(withdrawalStorageKey, JSON.stringify(items))
}

export function readTeacherSales(): TeacherSale[] {
  try {
    const items = JSON.parse(localStorage.getItem(salesStorageKey) || '[]') as TeacherSale[]
    return Array.isArray(items) && items.length ? items : demoSales
  } catch { return demoSales }
}

export function recordTeacherSale(sale: TeacherSale) {
  const current = readTeacherSales().filter((item) => item.id !== sale.id)
  const next = [sale, ...current]
  localStorage.setItem(salesStorageKey, JSON.stringify(next))
  return next
}

export default function TeacherWallet({ mode = 'teacher', teacherName = 'Alex Mutua' }: { mode?: 'teacher' | 'admin'; teacherName?: string }) {
  const [sales, setSales] = useState<TeacherSale[]>(readTeacherSales)
  const [withdrawals, setWithdrawals] = useState<TeacherWithdrawalRequest[]>(readTeacherWithdrawals)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'M-PESA' | 'Bank transfer'>('M-PESA')
  const [phone, setPhone] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState(teacherName)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})
  const saleEarnings = sales.filter((sale) => sale.status === 'Settled to wallet').reduce((sum, sale) => sum + sale.netAmount, 0)
  const pendingSettlement = sales.filter((sale) => sale.status === 'Pending settlement').reduce((sum, sale) => sum + sale.netAmount, 0)
  const reservedOrPaid = withdrawals.filter((request) => ['Pending admin approval', 'Approved', 'Paid'].includes(request.status)).reduce((sum, request) => sum + request.amount, 0)
  const available = Math.max(0, saleEarnings - reservedOrPaid)
  const withdrawn = withdrawals.filter((request) => request.status === 'Paid').reduce((sum, request) => sum + request.amount, 0)
  const totalNet = useMemo(() => sales.reduce((sum, sale) => sum + sale.netAmount, 0), [sales])
  const persistWithdrawals = (next: TeacherWithdrawalRequest[]) => { setWithdrawals(next); saveTeacherWithdrawals(next) }
  const settleDemoSales = () => {
    const next = sales.map((sale) => sale.status === 'Pending settlement' ? { ...sale, status: 'Settled to wallet' as const } : sale)
    setSales(next)
    localStorage.setItem(salesStorageKey, JSON.stringify(next))
    setNotice('Eligible sale proceeds were settled into the demo wallet. No money moved.')
  }
  const requestWithdrawal = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const requestedAmount = Number(amount)
    if (!Number.isFinite(requestedAmount) || requestedAmount < 100) { setError('Enter at least KSh 100 to request a payout.'); return }
    if (requestedAmount > available) { setError(`Your available wallet balance is KSh ${available.toLocaleString()}.`); return }
    if (method === 'M-PESA' && !/^(?:\+?254|0)(?:7|1)\d{8}$/.test(phone.replace(/[\s-]/g, ''))) { setError('Enter a valid Kenyan mobile number for M-PESA.'); return }
    if (method === 'Bank transfer' && (!bankName.trim() || accountNumber.trim().length < 4 || !accountName.trim())) { setError('Enter the bank, account name and account number.'); return }
    const request: TeacherWithdrawalRequest = { id: `WD-${Date.now()}`, teacherName, amount: requestedAmount, method, account: method === 'M-PESA' ? phone.trim() : `${bankName.trim()} · ${accountName.trim()} · ${accountNumber.trim()}`, requestedAt: new Date().toISOString(), status: 'Pending admin approval' }
    persistWithdrawals([request, ...withdrawals])
    setAmount(''); setPhone(''); setAccountNumber(''); setError(''); setNotice('Withdrawal request sent to the admin approval inbox.')
  }
  const updateRequest = (id: string, status: TeacherWithdrawalStatus) => {
    const next = withdrawals.map((request) => request.id === id ? { ...request, status, adminNote: adminNotes[id]?.trim() || (status === 'Approved' ? 'Approved for demo payout.' : status === 'Rejected' ? 'Please review payout details and resubmit.' : status === 'Paid' ? 'Demo payout marked as sent.' : request.adminNote) } : request)
    persistWithdrawals(next)
  }
  const statusIcon = (status: TeacherWithdrawalStatus) => status === 'Paid' ? <CircleCheck size={15}/> : status === 'Rejected' ? <CircleAlert size={15}/> : status === 'Approved' ? <Check size={15}/> : <Clock3 size={15}/>

  if (mode === 'admin') return <section className="tw-shell"><div className="tw-header"><span className="tw-icon"><WalletCards size={20}/></span><div><span className="tw-eyebrow">ADMIN FINANCE APPROVALS</span><h2>Teacher wallet settlements & payouts</h2><p>Settle eligible sales to teacher wallets, then review withdrawal requests. All actions are recorded locally in this demo.</p></div></div><div className="tw-kpis"><article><span>Pending sales settlement</span><strong>KSh {pendingSettlement.toLocaleString()}</strong><small>Sales awaiting wallet release</small></article><article><span>Wallet funds available</span><strong>KSh {available.toLocaleString()}</strong><small>{teacherName} · demo account</small></article><article><span>Withdrawal requests</span><strong>{withdrawals.filter((request) => request.status === 'Pending admin approval').length}</strong><small>Awaiting admin decision</small></article></div><div className="tw-admin-settle"><span><Banknote size={17}/><span><strong>Settle approved sales into wallet</strong><small>Sales are not withdrawable until admin settlement.</small></span></span><button className="tw-button tw-amber" disabled={!pendingSettlement} onClick={settleDemoSales}>Settle KSh {pendingSettlement.toLocaleString()} to wallet <ArrowRightIcon/></button></div><div className="tw-section-heading"><div><h3>Withdrawal approval queue</h3><p>Approve or reject every request. Mark paid only after settlement is confirmed.</p></div></div>{withdrawals.length === 0 ? <div className="tw-empty"><CreditCard size={20}/><strong>No withdrawal requests</strong><small>Teacher payout requests will appear here for admin approval.</small></div> : <div className="tw-list">{withdrawals.map((request) => <article className="tw-admin-request" key={request.id}><span className={`tw-status-icon ${statusClass(request.status)}`}>{statusIcon(request.status)}</span><div className="tw-request-copy"><div><strong>{request.teacherName}</strong><span className={`tw-status ${statusClass(request.status)}`}>{request.status}</span></div><small>{request.id} · {request.method} · {request.account}</small><small>Requested {formatDate(request.requestedAt)}</small>{request.adminNote && <small className="tw-admin-note">Note: {request.adminNote}</small>}{request.status === 'Pending admin approval' && <div className="tw-admin-actions"><input aria-label={`Admin note for ${request.id}`} placeholder="Optional decision note" value={adminNotes[request.id] || ''} onChange={(event) => setAdminNotes((current) => ({ ...current, [request.id]: event.target.value }))}/><button className="tw-button tw-light" onClick={() => updateRequest(request.id, 'Rejected')}>Reject</button><button className="tw-button tw-primary" onClick={() => updateRequest(request.id, 'Approved')}>Approve payout</button></div>}{request.status === 'Approved' && <button className="tw-button tw-primary tw-paid-action" onClick={() => updateRequest(request.id, 'Paid')}>Record payout sent <Check size={14}/></button>}</div><strong className="tw-request-amount">KSh {request.amount.toLocaleString()}</strong></article>)}</div>}<div className="tw-disclaimer"><Info size={15}/><span>Demo only. Approval and settlement statuses are simulated; no bank or M-PESA transaction is sent.</span></div></section>

  return <section className="tw-shell"><div className="tw-header"><span className="tw-icon"><WalletCards size={20}/></span><div><span className="tw-eyebrow">TEACHER EARNINGS</span><h2>Wallet & payouts</h2><p>Track sales, see what is ready to withdraw, and request a payout after admin settlement.</p></div><span className="tw-demo-tag">Demo wallet</span></div><div className="tw-kpis"><article className="tw-kpi-primary"><span>Available to withdraw</span><strong>KSh {available.toLocaleString()}</strong><small>Settled earnings after pending and paid requests</small></article><article><span>Pending settlement</span><strong>KSh {pendingSettlement.toLocaleString()}</strong><small>Needs admin settlement before withdrawal</small></article><article><span>Total net earnings</span><strong>KSh {totalNet.toLocaleString()}</strong><small>After illustrative platform fee · {sales.length} sales</small></article><article><span>Withdrawn</span><strong>KSh {withdrawn.toLocaleString()}</strong><small>Demo payouts recorded</small></article></div><div className="tw-layout"><div className="tw-main-column"><section className="tw-card"><div className="tw-section-heading"><div><h3>Sales & wallet settlements</h3><p>Each purchase earns a sample net amount after an illustrative 20% platform fee.</p></div><span className="tw-net-chip">Teacher share · 80%</span></div>{sales.length === 0 ? <div className="tw-empty"><FileText size={20}/><strong>No resource sales yet</strong><small>Sales from your approved marketplace listings will appear here.</small></div> : <div className="tw-sales-table"><div className="tw-table-head"><span>Resource & sale</span><span>Gross</span><span>Platform fee</span><span>Teacher net</span><span>Status</span></div>{sales.map((sale) => <article key={sale.id}><div className="tw-sale-name"><strong>{sale.paperTitle}</strong><small>{sale.id} · {sale.purchasedAt}</small></div><span>KSh {sale.grossAmount.toLocaleString()}</span><span className="tw-fee">− KSh {sale.platformFee.toLocaleString()}</span><strong>KSh {sale.netAmount.toLocaleString()}</strong><span className={`tw-status ${sale.status === 'Settled to wallet' ? 'tw-approved' : 'tw-pending'}`}>{sale.status}</span></article>)}</div>}</section><section className="tw-card"><div className="tw-section-heading"><div><h3>Withdrawal history</h3><p>Every payout request needs admin approval.</p></div></div>{withdrawals.length === 0 ? <div className="tw-empty tw-empty-short"><ArrowUpRight size={18}/><span>No payouts requested yet.</span></div> : <div className="tw-list">{withdrawals.map((request) => <article className="tw-withdraw-row" key={request.id}><span className={`tw-status-icon ${statusClass(request.status)}`}>{statusIcon(request.status)}</span><div className="tw-request-copy"><strong>{request.method} · {request.account}</strong><small>{request.id} · {formatDate(request.requestedAt)}</small>{request.adminNote && <small className="tw-admin-note">Admin: {request.adminNote}</small>}</div><span className={`tw-status ${statusClass(request.status)}`}>{request.status}</span><strong>KSh {request.amount.toLocaleString()}</strong></article>)}</div>}</section></div><div className="tw-side-column"><form className="tw-card tw-withdraw-form" onSubmit={requestWithdrawal}><div className="tw-section-heading"><div><h3>Request a withdrawal</h3><p>Request at least KSh 100 from settled funds.</p></div><span className="tw-withdraw-icon"><ArrowUpRight size={17}/></span></div><label>Amount (KSh)<input type="number" min="100" step="1" max={available} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 1,000" required/></label><label>Payout method<select value={method} onChange={(event) => setMethod(event.target.value as 'M-PESA' | 'Bank transfer')}><option>M-PESA</option><option>Bank transfer</option></select></label>{method === 'M-PESA' ? <label>M-PESA number<input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712 345 678" required/></label> : <><label>Bank name<input value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Bank name" required/></label><label>Account name<input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Account holder name" required/></label><label>Account number<input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Account number" required/></label></>}<button className="tw-button tw-amber tw-submit" type="submit" disabled={available < 100}>Send for admin approval <ArrowUpRight size={15}/></button>{error && <p className="tw-error" role="alert">{error}</p>}{notice && <p className="tw-notice" role="status"><Check size={14}/>{notice}</p>}<small className="tw-sim-note"><Info size={13}/> Prototype only. No funds are transferred.</small></form><section className="tw-card tw-payout-info"><h3>How payouts work</h3><ol><li><span>1</span><p><strong>Resource is purchased</strong><small>Your net share is recorded in sales.</small></p></li><li><span>2</span><p><strong>Admin settles earnings</strong><small>Approved sale proceeds move to wallet balance.</small></p></li><li><span>3</span><p><strong>Request withdrawal</strong><small>Admin reviews and approves or rejects payout.</small></p></li><li><span>4</span><p><strong>Payout is recorded</strong><small>Admin marks payment sent after processing it.</small></p></li></ol></section></div></div><div className="tw-disclaimer"><Info size={15}/><span>Illustrative 80/20 teacher/platform revenue split is a placeholder product assumption. Wallet balances and payout statuses are local demo data only.</span></div></section>
}

function statusClass(status: TeacherWithdrawalStatus) { return status === 'Paid' ? 'tw-paid' : status === 'Rejected' ? 'tw-rejected' : status === 'Approved' ? 'tw-approved' : 'tw-pending' }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) }
function ArrowRightIcon() { return <ArrowUpRight size={14}/> }
