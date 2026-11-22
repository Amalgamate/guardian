import { useEffect, useState } from 'react'
import { Building2, RefreshCw, Search, Users } from 'lucide-react'
import { inboxApi, type InboxRecipient } from './inboxApi'
import './connected-admin.css'

export default function ConnectedAdminUsers() {
  const [users, setUsers] = useState<InboxRecipient[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try { setUsers((await inboxApi.users()).users) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the user list.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const visibleUsers = users.filter((user) => `${user.fullName} ${user.email ?? ''} ${user.phone ?? ''} ${user.roles.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="ws-card ws-admin-users">
    <div className="ws-card-heading"><div><span className="ws-kicker">LIVE ACCOUNT DIRECTORY</span><h2>User management</h2><p>{users.length} accounts returned by the administration API.</p></div><button className="ws-button ws-light" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
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
