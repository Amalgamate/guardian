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

type Institution = { id: string; name: string; institutionType: string; county: string | null; status: string }

export function ConnectedAdminInstitutions() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    fetch('/api/admin/institutions', { credentials: 'include' }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { institutions?: Institution[]; error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load institutions.')
      return payload.institutions ?? []
    }).then((records) => { if (active) setInstitutions(records) }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load institutions.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  return <section className="ws-card ws-admin-users"><div className="ws-card-heading"><div><span className="ws-kicker">LIVE ORGANIZATION DIRECTORY</span><h2>Institutions</h2><p>{institutions.length} institution records returned by the administration API.</p></div></div>
    {error ? <div className="ws-admin-empty" role="alert"><strong>Could not load institutions</strong><small>{error}</small></div> : loading ? <div className="ws-admin-empty"><RefreshCw size={17}/><span>Loading institutions…</span></div> : institutions.length === 0 ? <div className="ws-admin-empty"><Building2 size={19}/><strong>No institutions registered yet</strong><small>Created institutions will appear here.</small></div> : <div className="ws-admin-user-list">{institutions.map((institution) => <article key={institution.id}><span className="ws-admin-user-avatar"><Building2 size={16}/></span><div><strong>{institution.name}</strong><small>{[institution.institutionType, institution.county].filter(Boolean).join(' · ') || 'Institution details not provided'}</small></div><div className="ws-admin-user-roles"><span>{institution.status}</span></div></article>)}</div>}
  </section>
}
