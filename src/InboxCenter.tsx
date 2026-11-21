import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, Bell, Check, CheckCheck, Clock3, Inbox, MessageCircle, MessageSquare, MoreHorizontal, Plus, Search, Send, ShieldCheck, X } from 'lucide-react'
import './inbox-center.css'
import './inbox-whatsapp.css'

type Message = { id: string; sender: string; body: string; sentAt: string; direction: 'in' | 'out'; channel?: 'In-app' | 'WhatsApp' }
type Thread = { id: string; subject: string; participant: string; role: string; updatedAt: string; unread: boolean; status: 'Open' | 'Resolved'; messages: Message[] }
export type WithdrawalStatus = 'Pending admin approval' | 'Approved' | 'Rejected' | 'Paid'
export type WithdrawalRequest = { id: string; teacherName: string; amount: number; method: string; account: string; requestedAt: string; status: WithdrawalStatus; adminNote?: string }

const INBOX_KEY = 'examify-inbox-threads'
const PAYOUT_KEY = 'examify-withdrawal-requests'
const sampleThreads: Thread[] = [
  { id: 'msg-101', subject: 'Question about my assessment result', participant: 'Jane Mwangi', role: 'Learner · Grade 8', updatedAt: 'Today · 9:42 am', unread: true, status: 'Open', messages: [{ id: 'm1', sender: 'Jane Mwangi', body: 'I completed the Term 2 Mathematics assessment but I am not sure how the topic score was calculated.', sentAt: 'Today · 9:38 am', direction: 'in' }, { id: 'm2', sender: 'Guardian Exams Support', body: 'Thanks for checking in. The topic breakdown is based on the marks assigned to each question in this sample assessment.', sentAt: 'Today · 9:42 am', direction: 'out' }] },
  { id: 'msg-102', subject: 'Resource submission review', participant: 'Alex Mutua', role: 'Teacher · Greenfield Academy', updatedAt: 'Yesterday · 3:15 pm', unread: true, status: 'Open', messages: [{ id: 'm3', sender: 'Alex Mutua', body: 'Could you let me know what is required before I submit a paper to the marketplace?', sentAt: 'Yesterday · 3:12 pm', direction: 'in' }] },
  { id: 'msg-103', subject: 'Family plan options', participant: 'Miriam Mwangi', role: 'Parent', updatedAt: 'Mon · 11:20 am', unread: false, status: 'Resolved', messages: [{ id: 'm4', sender: 'Miriam Mwangi', body: 'Can I monitor more than one learner from the family dashboard?', sentAt: 'Mon · 11:10 am', direction: 'in' }, { id: 'm5', sender: 'Guardian Exams Support', body: 'The illustrative Family plan includes multiple learner profiles in this demo.', sentAt: 'Mon · 11:20 am', direction: 'out' }] },
]

function readThreads(): Thread[] {
  try { const parsed = JSON.parse(localStorage.getItem(INBOX_KEY) || 'null'); return Array.isArray(parsed) ? parsed : sampleThreads } catch { return sampleThreads }
}
function readWithdrawals(): WithdrawalRequest[] {
  try { const parsed = JSON.parse(localStorage.getItem(PAYOUT_KEY) || '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}
function compactDate(value: string) { try { return new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) } catch { return value } }

export default function InboxCenter({ admin = false, userName = 'Jane Mwangi', onNotify }: { admin?: boolean; userName?: string; onNotify?: (message: string) => void }) {
  const [tab, setTab] = useState<'messages' | 'payouts'>(admin ? 'messages' : 'messages')
  const [threads, setThreads] = useState<Thread[]>(readThreads)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>(readWithdrawals)
  const [activeId, setActiveId] = useState('')
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Resolved'>('All')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [replyChannel, setReplyChannel] = useState<'In-app' | 'WhatsApp'>('In-app')
  const [notice, setNotice] = useState('')
  const [payoutNotes, setPayoutNotes] = useState<Record<string, string>>({})
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')

  useEffect(() => { localStorage.setItem(INBOX_KEY, JSON.stringify(threads)) }, [threads])
  useEffect(() => { localStorage.setItem(PAYOUT_KEY, JSON.stringify(withdrawals)) }, [withdrawals])
  const visibleThreads = useMemo(() => threads.filter((thread) => {
    const matchesQuery = `${thread.subject} ${thread.participant} ${thread.role}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'All' || (filter === 'Unread' ? thread.unread : thread.status === 'Resolved')
    return matchesQuery && matchesFilter && (admin || thread.participant === userName || thread.participant === 'Guardian Exams Support')
  }), [threads, query, filter, admin, userName])
  const activeThread = visibleThreads.find((thread) => thread.id === activeId) ?? visibleThreads[0]
  const unreadCount = threads.filter((thread) => thread.unread && (admin || thread.participant === userName)).length
  const pendingPayouts = withdrawals.filter((item) => item.status === 'Pending admin approval')
  const payoutTotal = pendingPayouts.reduce((sum, item) => sum + item.amount, 0)

  const openThread = (thread: Thread) => {
    setActiveId(thread.id)
    if (thread.unread) setThreads((all) => all.map((item) => item.id === thread.id ? { ...item, unread: false } : item))
  }
  const sendReply = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !activeThread) return
    const channel = admin ? replyChannel : 'In-app'
    const message: Message = { id: `reply-${Date.now()}`, sender: admin ? 'Guardian Exams Admin' : userName, body, sentAt: 'Just now', direction: 'out', channel }
    setThreads((all) => all.map((item) => item.id === activeThread.id ? { ...item, updatedAt: 'Just now', status: 'Open', messages: [...item.messages, message] } : item))
    setDraft('')
    setNotice(channel === 'WhatsApp' ? 'WhatsApp delivery simulated for this conversation. Baileys is not connected; no message was sent.' : 'Message added to this in-app conversation. No external message was sent.')
    onNotify?.(channel === 'WhatsApp' ? 'WhatsApp delivery simulated. No message was sent.' : 'In-app reply saved in the prototype inbox.')
    setReplyChannel('In-app')
  }
  const createThread = (event: FormEvent) => {
    event.preventDefault()
    if (!newSubject.trim() || !newBody.trim()) return
    const id = `msg-${Date.now()}`
    const thread: Thread = { id, subject: newSubject.trim(), participant: userName, role: admin ? 'Platform admin' : 'Learner', updatedAt: 'Just now', unread: false, status: 'Open', messages: [{ id: `${id}-1`, sender: userName, body: newBody.trim(), sentAt: 'Just now', direction: 'out' }] }
    setThreads((all) => [thread, ...all])
    setActiveId(id)
    setNewSubject('')
    setNewBody('')
    setNewMessageOpen(false)
    onNotify?.('Your in-app message was saved. No email or SMS was sent.')
  }
  const reviewPayout = (id: string, status: WithdrawalStatus) => {
    const note = payoutNotes[id]?.trim() || (status === 'Approved' ? 'Approved by platform admin.' : 'Please review the payout details and resubmit.')
    setWithdrawals((all) => all.map((item) => item.id === id ? { ...item, status, adminNote: note } : item))
    setNotice(status === 'Approved' ? 'Withdrawal approved. Settlement can now be simulated.' : status === 'Paid' ? 'Demo settlement recorded.' : 'Withdrawal returned to the teacher with a review note.')
  }
  const addSupportThread = () => { setNewMessageOpen(true); setNewSubject('Help with my account') }

  return <section className="inbox-center">
    <div className="inbox-page-head"><div><span className="inbox-eyebrow">GUARDIAN EXAMS · IN-APP COMMUNICATIONS</span><h2>{admin ? 'Inbox & approvals' : 'Your inbox'}</h2><p>{admin ? 'Manage user conversations and approve teacher payout requests.' : 'Messages and updates stay in your Guardian Exams workspace.'}</p></div>{!admin && <button className="inbox-primary" onClick={addSupportThread}><Plus size={15}/> New message</button>}</div>
    <div className="inbox-tabs" role="tablist" aria-label="Inbox sections"><button className={tab === 'messages' ? 'active' : ''} role="tab" aria-selected={tab === 'messages'} onClick={() => setTab('messages')}><Inbox size={15}/> Messages{unreadCount > 0 && <b>{unreadCount}</b>}</button>{admin && <button className={tab === 'payouts' ? 'active' : ''} role="tab" aria-selected={tab === 'payouts'} onClick={() => setTab('payouts')}><ShieldCheck size={15}/> Payout approvals{pendingPayouts.length > 0 && <b>{pendingPayouts.length}</b>}</button>}</div>
    {notice && <div className="inbox-notice" role="status"><CheckCheck size={15}/>{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={14}/></button></div>}
    {tab === 'messages' ? <div className="inbox-layout"><aside className="inbox-list-panel"><div className="inbox-search"><Search size={15}/><input aria-label="Search messages" placeholder="Search inbox" value={query} onChange={(e) => setQuery(e.target.value)}/></div><div className="inbox-filter-row">{(['All', 'Unread', 'Resolved'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="inbox-threads">{visibleThreads.map((thread) => <button key={thread.id} className={`inbox-thread ${activeThread?.id === thread.id ? 'current' : ''}`} onClick={() => openThread(thread)}><span className="inbox-thread-avatar">{thread.participant.split(' ').map((piece) => piece[0]).slice(0, 2).join('')}</span><span className="inbox-thread-copy"><span><strong>{thread.participant}</strong><time>{thread.updatedAt}</time></span><b>{thread.subject}</b><small>{thread.messages.at(-1)?.body}</small></span>{thread.unread && <i className="inbox-unread-dot"/>}</button>)}{visibleThreads.length === 0 && <div className="inbox-empty-mini">No conversations match this view.</div>}</div></aside><div className="inbox-conversation">{activeThread ? <><header className="inbox-conversation-head"><div className="inbox-thread-avatar">{activeThread.participant.split(' ').map((piece) => piece[0]).slice(0, 2).join('')}</div><span><strong>{activeThread.participant}</strong><small>{activeThread.role} · {activeThread.status}</small></span><button className="inbox-icon-action" aria-label="Conversation options" title="Conversation options"><MoreHorizontal size={18}/></button><button className="inbox-icon-action" aria-label={activeThread.status === 'Resolved' ? 'Reopen conversation' : 'Resolve conversation'} title={activeThread.status === 'Resolved' ? 'Reopen conversation' : 'Resolve conversation'} onClick={() => setThreads((all) => all.map((thread) => thread.id === activeThread.id ? { ...thread, status: thread.status === 'Resolved' ? 'Open' : 'Resolved' } : thread))}><Archive size={16}/></button></header><div className="inbox-conversation-title"><strong>{activeThread.subject}</strong><small>In-app conversation · sample workspace</small></div><div className="inbox-message-list">{activeThread.messages.map((message) => <article key={message.id} className={`inbox-message ${message.direction === 'out' ? 'outgoing' : ''}`}><span className="inbox-message-sender">{message.sender}<b className={`inbox-channel-badge ${message.channel === 'WhatsApp' ? 'whatsapp' : ''}`}>{message.channel || 'In-app'}{message.channel === 'WhatsApp' ? ' · simulated' : ''}</b></span><p>{message.body}</p><time>{message.sentAt}</time></article>)}</div><form className="inbox-reply-form" onSubmit={sendReply}>{admin && <div className="inbox-channel-picker" role="group" aria-label="Reply delivery channel"><span>Send via</span><button type="button" className={replyChannel === 'In-app' ? 'selected' : ''} aria-pressed={replyChannel === 'In-app'} onClick={() => setReplyChannel('In-app')}><MessageSquare size={14}/> In-app</button><button type="button" className={replyChannel === 'WhatsApp' ? 'selected whatsapp' : 'whatsapp'} aria-pressed={replyChannel === 'WhatsApp'} onClick={() => setReplyChannel('WhatsApp')}><MessageCircle size={14}/> WhatsApp</button></div>}<label htmlFor="inbox-reply">{replyChannel === 'WhatsApp' && admin ? 'WhatsApp reply preview' : 'Reply in the app'}</label><div><textarea id="inbox-reply" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a helpful reply…"/><button className="inbox-primary" type="submit" disabled={!draft.trim()}><Send size={15}/> Send</button></div><small>{replyChannel === 'WhatsApp' && admin ? 'Demo preview only. Baileys is not connected; no external message is sent.' : 'Replies are saved to this inbox only. Email, SMS and WhatsApp are not sent.'}</small></form></> : <div className="inbox-empty-state"><MessageSquare size={24}/><strong>Select a conversation</strong><span>Choose a message to read or reply.</span></div>}</div></div> : <div className="payout-approval-page"><div className="payout-summary-row"><article><span>Awaiting admin review</span><strong>{pendingPayouts.length}</strong><small>Withdrawal requests</small></article><article><span>Total requested</span><strong>KSh {payoutTotal.toLocaleString('en-KE')}</strong><small>Pending approval amount</small></article><article><span>After approval</span><strong>Settlement</strong><small>Admin records the simulated payment</small></article></div><div className="payout-guidance"><ShieldCheck size={17}/><span><strong>Admin approval is required for every teacher withdrawal.</strong><small>Approve, reject with a note, then mark an approved request as settled. These controls do not transfer money.</small></span></div>{withdrawals.length === 0 ? <div className="inbox-empty-state payout-empty"><Clock3 size={23}/><strong>No withdrawal requests yet</strong><span>Teacher wallet requests will appear here for admin review.</span></div> : <div className="payout-request-list">{withdrawals.map((request) => <article key={request.id} className="payout-request"><div className="payout-request-head"><span className="payout-person-avatar">{request.teacherName.split(' ').map((piece) => piece[0]).slice(0, 2).join('')}</span><span className="payout-teacher"><strong>{request.teacherName}</strong><small>Requested {compactDate(request.requestedAt)} · {request.method}</small></span><span className={`payout-status status-${request.status.toLowerCase().replaceAll(' ', '-')}`}>{request.status}</span></div><div className="payout-detail-row"><span>Requested amount<strong>KSh {request.amount.toLocaleString('en-KE')}</strong></span><span>Payout destination<strong>{request.account}</strong></span><span>Request reference<strong>{request.id}</strong></span></div>{request.adminNote && <p className="payout-admin-note">Admin note: {request.adminNote}</p>}{request.status === 'Pending admin approval' && <div className="payout-actions"><input aria-label={`Review note for ${request.teacherName}`} value={payoutNotes[request.id] || ''} onChange={(e) => setPayoutNotes((all) => ({ ...all, [request.id]: e.target.value }))} placeholder="Reason or approval note"/><button className="payout-reject" onClick={() => reviewPayout(request.id, 'Rejected')}><X size={14}/> Reject</button><button className="inbox-primary" onClick={() => reviewPayout(request.id, 'Approved')}><Check size={14}/> Approve payout</button></div>}{request.status === 'Approved' && <div className="payout-actions"><span className="payout-approved-hint"><CheckCheck size={14}/> Admin approved. Record settlement after processing the transfer.</span><button className="inbox-primary" onClick={() => reviewPayout(request.id, 'Paid')}><CheckCheck size={14}/> Mark as paid</button></div>}</article>)}</div>}<div className="payout-completed-list"><h3>Previously reviewed requests</h3>{withdrawals.filter((request) => request.status === 'Paid' || request.status === 'Rejected').map((request) => <div key={`past-${request.id}`}><span><strong>{request.teacherName}</strong><small>{request.method} · KSh {request.amount.toLocaleString('en-KE')}</small></span><b className={`payout-status status-${request.status.toLowerCase()}`}>{request.status}</b></div>)}</div></div>}
    <div className="inbox-footnote"><Bell size={14}/> These are prototype in-app messages and notifications. No message is sent to an external channel.</div>
    {newMessageOpen && <div className="inbox-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewMessageOpen(false) }}><form className="inbox-new-message-modal" onSubmit={createThread}><button type="button" className="inbox-modal-close" onClick={() => setNewMessageOpen(false)} aria-label="Close"><X size={17}/></button><span className="inbox-eyebrow">IN-APP SUPPORT</span><h3>Start a conversation</h3><p>Send a message to the Guardian Exams support inbox. Nothing leaves the demo.</p><label>Subject<input required value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="What do you need help with?"/></label><label>Message<textarea required rows={4} value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Describe your question or issue…"/></label><button className="inbox-primary" type="submit"><Send size={14}/> Send in-app message</button></form></div>}
  </section>
}
