import { useEffect, useState } from 'react'
import { ArrowRight, Building2, FileCheck2, RefreshCw, Users, WalletCards } from 'lucide-react'
import { inboxApi, type InboxRecipient } from './inboxApi'
import { marketplaceApi } from './marketplaceApi'
import './connected-admin.css'

type Institution = { id: string; name: string; status: string }
type OverviewData = { users: InboxRecipient[]; institutions: Institution[]; reviews: number; settlements: number; payouts: number }

async function loadInstitutions(): Promise<Institution[]> {
  const response = await fetch('/api/admin/institutions', { credentials: 'include' })
  const payload = await response.json().catch(() => ({})) as { institutions?: Institution[]; error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || 'Could not load institutions.')
  return payload.institutions ?? []
}

export default function ConnectedAdminOverview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      inboxApi.users(),
      loadInstitutions(),
      marketplaceApi.adminSubmissions('submitted'),
      marketplaceApi.adminSettlements('pending'),
      marketplaceApi.adminPayouts('pending'),
    ]).then(([users, institutions, reviews, settlements, payouts]) => {
      if (active) setData({ users: users.users, institutions, reviews: reviews.submissions.length, settlements: settlements.settlements.length, payouts: payouts.payouts.length })
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load live administration data.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return <section className="ws-admin-overview">
    <div className="ws-admin-metrics">
      <article><span><Users size={17}/> Accounts</span><strong>{loading ? '—' : data?.users.length ?? '—'}</strong><small>Live registered users</small></article>
      <article><span><Building2 size={17}/> Institutions</span><strong>{loading ? '—' : data?.institutions.length ?? '—'}</strong><small>Live institution records</small></article>
      <article><span><FileCheck2 size={17}/> Content reviews</span><strong>{loading ? '—' : data?.reviews ?? '—'}</strong><small>Awaiting your review</small></article>
      <article><span><WalletCards size={17}/> Settlements</span><strong>{loading ? '—' : data?.settlements ?? '—'}</strong><small>Awaiting approval</small></article>
      <article><span><WalletCards size={17}/> Payout requests</span><strong>{loading ? '—' : data?.payouts ?? '—'}</strong><small>Awaiting your decision</small></article>
    </div>
    {error && <p className="ws-admin-error" role="alert">{error}</p>}
    {!error && !loading && <p className="ws-admin-source"><RefreshCw size={14}/> Counts are read from the live development database.</p>}
    <section className="ws-card ws-admin-actions"><div><span className="ws-kicker">ADMINISTRATION</span><h2>What needs attention?</h2><p>Open live records to review users, content, teacher finance requests and provider readiness.</p></div><div>{['User management','Institutions','Review queue','Teacher payouts','Payments','Inbox'].map((page) => <button key={page} className="ws-button ws-light" onClick={() => onNavigate(page)}>{page}<ArrowRight size={14}/></button>)}</div></section>
  </section>
}
