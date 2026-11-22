import { useEffect, useState, type FormEvent } from 'react'
import { Building2, Copy, RefreshCw, Search, Send, ShieldPlus, UserPlus, Users } from 'lucide-react'
import { inboxApi, type InboxRecipient } from './inboxApi'
import './connected-admin.css'

export default function ConnectedAdminUsers() {
  const [users, setUsers] = useState<InboxRecipient[]>([])
  const [institutions, setInstitutions] = useState<Array<{id: string; name: string; status: string}>>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accessMode, setAccessMode] = useState<'invite' | 'assign'>('invite')
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessRole, setAccessRole] = useState('Teacher')
  const [destinationEmail, setDestinationEmail] = useState('')
  const [destinationPhone, setDestinationPhone] = useState('')
  const [institutionId, setInstitutionId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [savingAccess, setSavingAccess] = useState(false)
  const [invitationLink, setInvitationLink] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [userResult, institutionsResponse] = await Promise.all([inboxApi.users(), fetch('/api/admin/institutions', { credentials: 'include' })])
      const payload = await institutionsResponse.json().catch(() => ({})) as { institutions?: Array<{id: string; name: string; status: string}>; error?: {message?: string} }
      if (!institutionsResponse.ok) throw new Error(payload.error?.message || 'Could not load institution options.')
      setUsers(userResult.users)
      setInstitutions(payload.institutions ?? [])
      setTargetUserId((current) => current || userResult.users[0]?.id || '')
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the user list.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const institutionRequired = ['Teacher', 'School admin', 'Examiner'].includes(accessRole)
  const submitAccess = async (event: FormEvent) => {
    event.preventDefault()
    setSavingAccess(true)
    setError('')
    setNotice('')
    setInvitationLink('')
    try {
      const body = accessMode === 'invite'
        ? { role: accessRole, email: destinationEmail.trim() || undefined, phone: destinationPhone.trim() || undefined, institutionId: institutionRequired ? institutionId : undefined }
        : { role: accessRole, institutionId: institutionRequired ? institutionId : undefined }
      const response = await fetch(accessMode === 'invite' ? '/api/admin/invitations' : `/api/admin/users/${targetUserId}/roles`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({})) as { invitationToken?: string; destination?: string; expiresAt?: string; message?: string; error?: {message?: string} }
      if (!response.ok) throw new Error(payload.error?.message || 'Could not update account access.')
      if (accessMode === 'invite' && payload.invitationToken) {
        setInvitationLink(`${window.location.origin}/?invite=${encodeURIComponent(payload.invitationToken)}`)
        setNotice(`Invitation created for ${payload.destination}. Copy the link and send it to them. It expires ${new Date(payload.expiresAt || '').toLocaleDateString()}.`)
        setDestinationEmail('')
        setDestinationPhone('')
      } else {
        setNotice('Role assigned to the account.')
        await refresh()
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update account access.') }
    finally { setSavingAccess(false) }
  }

  const copyInvitation = async () => {
    try { await navigator.clipboard.writeText(invitationLink); setNotice('Invitation link copied. Send it to the invited user.') }
    catch { setNotice('Copy was blocked by the browser. Select and copy the invitation link below.') }
  }

  const visibleUsers = users.filter((user) => `${user.fullName} ${user.email ?? ''} ${user.phone ?? ''} ${user.roles.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="ws-card ws-admin-users">
    <div className="ws-card-heading"><div><span className="ws-kicker">ACCESS & ACCOUNT LIFECYCLE</span><h2>User management</h2><p>Review who has access, grant roles to existing users, and invite staff into an institution workspace.</p></div><div className="ws-admin-heading-actions"><button className="ws-button ws-primary" onClick={() => { setAccessOpen((open) => !open); setAccessMode('invite') }}><UserPlus size={14}/> Invite user</button><button className="ws-button ws-light" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div></div>
    {accessOpen && <form className="ws-admin-access-form" onSubmit={(event) => void submitAccess(event)}><div className="ws-admin-access-heading"><span><ShieldPlus size={16}/><strong>{accessMode === 'invite' ? 'Invite a new user' : 'Grant a role to an existing user'}</strong></span><div><button type="button" className={accessMode === 'invite' ? 'selected' : ''} onClick={() => { setAccessMode('invite'); setInvitationLink(''); setError(''); setNotice('') }}>Invite</button><button type="button" className={accessMode === 'assign' ? 'selected' : ''} onClick={() => { setAccessMode('assign'); setInvitationLink(''); setError(''); setNotice('') }}>Assign role</button></div></div><div className="ws-admin-access-fields">{accessMode === 'assign' ? <label>Account<select required value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}><option value="">Choose an account</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {user.email || user.phone || 'no contact'}</option>)}</select></label> : <><label>Email address<input type="email" value={destinationEmail} onChange={(event) => setDestinationEmail(event.target.value)} placeholder="name@school.ac.ke"/></label><label>Phone number<input type="tel" value={destinationPhone} onChange={(event) => setDestinationPhone(event.target.value)} placeholder="+254 712 345 678"/></label></>}<label>Role<select value={accessRole} onChange={(event) => setAccessRole(event.target.value)}>{['Learner','Parent','Teacher','School admin','Examiner','Platform admin'].map((role) => <option key={role}>{role}</option>)}</select></label>{institutionRequired && <label>Institution<select required value={institutionId} onChange={(event) => setInstitutionId(event.target.value)}><option value="">Choose an active institution</option>{institutions.filter((institution) => institution.status === 'active').map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>}</div><small className="ws-admin-access-help">{accessMode === 'invite' ? 'At least one contact is required. The invite link is generated here; send it to the user yourself.' : 'Role assignment takes effect immediately and is written to the admin audit log.'}</small>{error && <p className="ws-admin-access-error" role="alert">{error}</p>}{notice && <p className="ws-admin-access-notice" role="status">{notice}</p>}{invitationLink && <div className="ws-admin-invite-link"><input aria-label="Invitation link" readOnly value={invitationLink}/><button type="button" className="ws-button ws-light" onClick={() => void copyInvitation()}><Copy size={14}/> Copy link</button></div>}<div className="ws-admin-access-submit"><button className="ws-button ws-primary" type="submit" disabled={savingAccess || (accessMode === 'assign' && !targetUserId)}>{savingAccess ? 'Saving…' : accessMode === 'invite' ? 'Create invitation' : 'Assign role'} <Send size={14}/></button></div></form>}
    <label className="ws-admin-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts"/></label>
    {error ? <div className="ws-admin-empty" role="alert"><strong>Could not load accounts</strong><small>{error}</small></div> : loading ? <div className="ws-admin-empty"><RefreshCw size={17}/><span>Loading registered accounts…</span></div> : visibleUsers.length === 0 ? <div className="ws-admin-empty"><Users size={19}/><strong>{users.length ? 'No matching accounts' : 'No registered accounts yet'}</strong><small>{users.length ? 'Try another name, email, phone or role.' : 'New verified accounts will appear here.'}</small></div> : <div className="ws-admin-user-list">{visibleUsers.map((user) => <article key={user.id}><span className="ws-admin-user-avatar">{user.fullName.trim().split(/\s+/).slice(0,2).map((part) => part[0]?.toUpperCase()).join('')}</span><div><strong>{user.fullName}</strong><small>{user.email || user.phone || 'No contact on file'}</small></div><div className="ws-admin-user-roles">{user.roles.length ? user.roles.map((role) => <span key={role}>{role}</span>) : <span>No role</span>}</div></article>)}</div>}
  </section>
}

type Institution = { id: string; name: string; institutionType: string; county: string | null; town?: string | null; registrationNumber?: string | null; status: string }
type InstitutionApplication = { id: string; institutionName: string; institutionType: string; registrationNumber: string; county: string; town: string; physicalAddress: string | null; contactName: string; contactRole: string; contactEmail: string; contactPhone: string; notes: string | null; createdAt: string }

export function ConnectedAdminInstitutions() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [applications, setApplications] = useState<InstitutionApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [institutionResponse, applicationResponse] = await Promise.all([
        fetch('/api/admin/institutions', { credentials: 'include' }),
        fetch('/api/admin/institution-applications?status=pending', { credentials: 'include' }),
      ])
      const institutionPayload = await institutionResponse.json().catch(() => ({})) as { institutions?: Institution[]; error?: { message?: string } }
      const applicationPayload = await applicationResponse.json().catch(() => ({})) as { applications?: InstitutionApplication[]; error?: { message?: string } }
      if (!institutionResponse.ok) throw new Error(institutionPayload.error?.message || 'Could not load institutions.')
      if (!applicationResponse.ok) throw new Error(applicationPayload.error?.message || 'Could not load school access applications.')
      setInstitutions(institutionPayload.institutions ?? [])
      setApplications(applicationPayload.applications ?? [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load institution records.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  const reviewApplication = async (application: InstitutionApplication, status: 'approved' | 'rejected') => {
    const reviewNote = status === 'rejected' ? window.prompt('Enter a reason for declining this application:') : ''
    if (status === 'rejected' && !reviewNote?.trim()) return
    setSavingId(application.id)
    setError('')
    try {
      const response = await fetch(`/api/admin/institution-applications/${application.id}/review`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reviewNote }) })
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || 'Could not review the application.')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not review the application.')
    } finally { setSavingId('') }
  }
  return <section className="ws-card ws-admin-users"><div className="ws-card-heading"><div><span className="ws-kicker">LIVE ORGANIZATION DIRECTORY</span><h2>Institutions</h2><p>{institutions.length} approved institution records · {applications.length} applications waiting for review.</p></div><button className="ws-button ws-light" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
    {error && <div className="ws-admin-empty" role="alert"><strong>Institution records need attention</strong><small>{error}</small></div>}
    <section className="ws-institution-application-queue"><div className="ws-institution-queue-heading"><div><span className="ws-kicker">ADMIN REVIEW</span><h3>School access applications</h3></div><span>{applications.length} pending</span></div>
      {loading ? <div className="ws-admin-empty"><RefreshCw size={17}/><span>Loading applications…</span></div> : applications.length === 0 ? <div className="ws-admin-empty"><Building2 size={19}/><strong>No applications waiting</strong><small>New school access requests will appear here.</small></div> : applications.map((application) => <article className="ws-institution-application" key={application.id}><div className="ws-institution-application-top"><div><strong>{application.institutionName}</strong><small>{application.institutionType} · Reg. {application.registrationNumber} · {application.town}, {application.county}</small></div><time>{new Date(application.createdAt).toLocaleDateString()}</time></div><div className="ws-institution-app-contact"><span><b>Representative</b>{application.contactName} · {application.contactRole}</span><span><b>Contact</b>{application.contactEmail} · {application.contactPhone}</span>{application.physicalAddress && <span><b>Address</b>{application.physicalAddress}</span>}{application.notes && <span><b>Needs</b>{application.notes}</span>}</div><div className="ws-institution-app-actions"><small>Approval creates the institution record. Contact the representative to complete their School admin account setup.</small><div><button className="ws-button ws-danger" onClick={() => void reviewApplication(application, 'rejected')} disabled={savingId === application.id}>Decline</button><button className="ws-button ws-primary" onClick={() => void reviewApplication(application, 'approved')} disabled={savingId === application.id}>{savingId === application.id ? 'Saving…' : 'Approve institution'}</button></div></div></article>)}
    </section>
    <div className="ws-institution-directory-heading"><h3>Approved institutions</h3></div>
    {loading ? <div className="ws-admin-empty"><RefreshCw size={17}/><span>Loading institutions…</span></div> : institutions.length === 0 ? <div className="ws-admin-empty"><Building2 size={19}/><strong>No approved institutions yet</strong><small>Approved school applications will appear here.</small></div> : <div className="ws-admin-user-list">{institutions.map((institution) => <article key={institution.id}><span className="ws-admin-user-avatar"><Building2 size={16}/></span><div><strong>{institution.name}</strong><small>{[institution.institutionType, institution.registrationNumber && `Reg. ${institution.registrationNumber}`, [institution.town, institution.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Institution details not provided'}</small></div><div className="ws-admin-user-roles"><span>{institution.status}</span></div></article>)}</div>}
  </section>
}
