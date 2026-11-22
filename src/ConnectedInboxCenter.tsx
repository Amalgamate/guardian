import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, Bell, Inbox, MessageSquare, RefreshCw, Reply, Send, ShieldCheck, X } from 'lucide-react'
import { inboxApi, type InboxMessage, type InboxRecipient } from './inboxApi'
import './connected-inbox.css'

type SentMessage = { id: string; subject: string; body: string; category: InboxMessage['category']; isAnnouncement: boolean; createdAt: string; recipientCount: number; recipientNames: string | null }

export default function ConnectedInboxCenter({ admin, currentUserId, onNotify }: { admin: boolean; currentUserId: string; onNotify: (message: string) => void }) {
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])
  const [selected, setSelected] = useState<InboxMessage | SentMessage | null>(null)
  const [users, setUsers] = useState<InboxRecipient[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<'support' | 'direct' | 'announcement'>('support')
  const [recipientId, setRecipientId] = useState('')
  const [audienceRole, setAudienceRole] = useState('Learner')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [inbox, unread, sent] = await Promise.all([inboxApi.list({ unread: unreadOnly, limit: 100 }), inboxApi.unreadCount(), inboxApi.sent(100)])
      setMessages(inbox.messages); setUnreadCount(unread.unreadCount); setSentMessages(sent.messages)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the inbox.') }
    finally { setLoading(false) }
  }, [unreadOnly])

  useEffect(() => { void refresh() }, [refresh])

  const openCompose = async (mode: 'support' | 'direct' | 'announcement') => {
    setComposeMode(mode); setReplyTo(null); setSubject(''); setBody(''); setRecipientId(''); setError(''); setComposeOpen(true)
    if (admin && mode !== 'support' && users.length === 0) {
      try { setUsers((await inboxApi.users()).users) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load recipients.') }
    }
  }

  const openMessage = async (message: InboxMessage | SentMessage) => {
    setSelected(message)
    if (tab === 'inbox' && 'readAt' in message && !message.readAt) {
      try { await inboxApi.markRead(message.id); setSelected({ ...message, readAt: new Date().toISOString() } as InboxMessage); await refresh() }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not mark the message as read.') }
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSending(true); setError('')
    try {
      if (replyTo) {
        await inboxApi.sendDirect(replyTo, subject || `Re: ${selected?.subject || 'Your message'}`, body, 'general')
        onNotify('Reply sent to the recipient’s in-app inbox.')
      } else if (composeMode === 'support') {
        const result = await inboxApi.sendSupport(subject, body)
        onNotify(result.messageText)
      } else if (composeMode === 'direct') {
        if (!recipientId) throw new Error('Choose a recipient for this message.')
        await inboxApi.sendDirect(recipientId, subject, body, 'general')
        onNotify('In-app message sent.')
      } else {
        const result = await inboxApi.announce(subject, body, audienceRole === 'all' ? 'all' : 'role', audienceRole === 'all' ? undefined : audienceRole)
        onNotify(`Announcement sent to ${result.announcement.recipientCount} active users.`)
      }
      setComposeOpen(false); setSubject(''); setBody(''); setReplyTo(null); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The message could not be sent.') }
    finally { setSending(false) }
  }

  const archiveSelected = async () => {
    if (!selected || tab !== 'inbox') return
    setSending(true); setError('')
    try { await inboxApi.archive(selected.id); setSelected(null); await refresh(); onNotify('Message archived.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not archive this message.') }
    finally { setSending(false) }
  }

  const reply = () => {
    if (!selected || !('senderId' in selected) || !selected.senderId || selected.senderId === currentUserId) return
    setReplyTo(selected.senderId); setComposeMode('direct'); setSubject(`Re: ${selected.subject}`); setBody(''); setComposeOpen(true); setError('')
  }

  const visibleMessages = tab === 'inbox' ? messages : sentMessages

  return <section className="ci-workspace">
    <header className="ci-heading"><div><span className="ci-eyebrow">PRIVATE IN-APP MESSAGES</span><h2>{admin ? 'Platform inbox' : 'Your inbox'}</h2><p>{admin ? 'Review support messages and contact any registered user.' : 'Get support and read updates from Guardian Exams.'}</p></div><div className="ci-heading-actions"><span className="ci-unread"><Bell size={15}/> {unreadCount} unread</span><button className="ci-button ci-primary" onClick={() => void openCompose(admin ? 'direct' : 'support')}><Send size={15}/>{admin ? 'New message' : 'Contact support'}</button></div></header>
    {error && <div className="ci-alert" role="alert">{error}</div>}
    <div className="ci-layout">
      <aside className="ci-list-panel">
        <div className="ci-tabs"><button className={tab === 'inbox' ? 'active' : ''} onClick={() => { setTab('inbox'); setSelected(null) }}><Inbox size={15}/> Inbox</button><button className={tab === 'sent' ? 'active' : ''} onClick={() => { setTab('sent'); setSelected(null) }}><Send size={14}/> Sent</button></div>
        <div className="ci-filter-row">{tab === 'inbox' && <label><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)}/> Unread only</label>}<button onClick={() => void refresh()} aria-label="Refresh inbox"><RefreshCw size={14}/></button></div>
        {loading ? <div className="ci-empty">Loading messages…</div> : visibleMessages.length === 0 ? <div className="ci-empty"><MessageSquare size={22}/><strong>No messages here</strong><span>{tab === 'inbox' ? 'New messages will appear in your inbox.' : 'Messages you send will appear here.'}</span></div> : <div className="ci-message-list">{visibleMessages.map((message) => <button key={message.id} className={`ci-message-item ${selected?.id === message.id ? 'selected' : ''} ${tab === 'inbox' && 'readAt' in message && !message.readAt ? 'unread' : ''}`} onClick={() => void openMessage(message)}><span className="ci-message-avatar">{tab === 'sent' ? 'You' : ('senderName' in message ? initials(message.senderName || 'System') : 'You')}</span><span className="ci-message-summary"><strong>{message.subject}</strong><small>{tab === 'sent' && 'recipientNames' in message ? `To ${message.recipientNames || 'no recipients'}` : ('senderName' in message ? message.senderName || 'System message' : 'You')}</small><small>{formatDate(message.createdAt)}</small></span>{tab === 'inbox' && 'readAt' in message && !message.readAt && <i aria-label="Unread"/>}</button>)}</div>}
      </aside>
      <main className="ci-detail-panel">{selected ? <>
        <div className="ci-detail-head"><div><span className="ci-category">{('category' in selected ? selected.category : 'general').replaceAll('_', ' ')}{selected.isAnnouncement ? ' · Announcement' : ''}</span><h3>{selected.subject}</h3><p>{tab === 'sent' && 'recipientNames' in selected ? `To ${selected.recipientNames || 'no recipients'}` : ('senderName' in selected ? `From ${selected.senderName || 'Guardian Exams system'}` : 'Sent by you')} · {formatDate(selected.createdAt)}</p></div><div className="ci-detail-actions">{tab === 'inbox' && <button className="ci-icon-button" title="Archive" onClick={() => void archiveSelected()} disabled={sending}><Archive size={16}/></button>}{'senderId' in selected && selected.senderId && selected.senderId !== currentUserId && <button className="ci-button" onClick={reply}><Reply size={14}/> Reply</button>}</div></div>
        <div className="ci-body">{selected.body}</div>
        <div className="ci-detail-foot"><ShieldCheck size={15}/> This message stays in the Guardian Exams in-app inbox. No email, SMS or WhatsApp was sent.</div>
      </> : <div className="ci-empty ci-detail-empty"><MessageSquare size={28}/><strong>Select a message</strong><span>Choose a message to read it here.</span></div>}</main>
    </div>
    {composeOpen && <div className="ci-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) setComposeOpen(false) }}><form className="ci-compose" onSubmit={(event) => void submit(event)}><button type="button" className="ci-close" onClick={() => setComposeOpen(false)} aria-label="Close"><X size={18}/></button><span className="ci-eyebrow">{replyTo ? 'IN-APP REPLY' : admin ? 'ADMIN MESSAGING' : 'IN-APP SUPPORT'}</span><h3>{replyTo ? 'Reply to message' : admin ? 'Send an in-app message' : 'Contact support'}</h3>
      {admin && !replyTo && <label>Message type<select value={composeMode} onChange={(e) => setComposeMode(e.target.value as 'direct' | 'announcement')}><option value="direct">Individual message</option><option value="announcement">Announcement</option></select></label>}
      {admin && !replyTo && composeMode === 'direct' && <label>Recipient<select required value={recipientId} onChange={(e) => setRecipientId(e.target.value)}><option value="">Choose a user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.roles.join(', ') || 'No role'}</option>)}</select></label>}
      {admin && !replyTo && composeMode === 'announcement' && <label>Audience<select value={audienceRole} onChange={(e) => setAudienceRole(e.target.value)}><option value="all">All active users</option>{['Learner','Parent','Teacher','School admin','Examiner','Platform admin'].map((role) => <option key={role} value={role}>{role}s</option>)}</select></label>}
      <label>Subject<input required minLength={1} maxLength={180} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this message about?"/></label><label>Message<textarea required minLength={1} maxLength={10000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…"/></label>
      <div className="ci-compose-foot"><span>In-app only · no external message is sent</span><button className="ci-button ci-primary" type="submit" disabled={sending}>{sending ? 'Sending…' : replyTo ? 'Send reply' : composeMode === 'announcement' ? 'Send announcement' : 'Send message'} <Send size={14}/></button></div>
    </form></div>}
  </section>
}

function initials(value: string) { return value.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) }
