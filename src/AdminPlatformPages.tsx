import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, CircleAlert, CreditCard, FileText, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import './admin-platform-pages.css'

export type AdminPlatformPage = 'CMS' | 'Subscriptions'
type CmsSettings = { releaseTitle: string; announcementEnabled: boolean; heroHeading: string; heroSupport: string }
type PlanStatus = 'draft' | 'active' | 'archived'
type SubscriptionPlan = { id: string; name: string; description: string; priceKes: number | null; billingInterval: string; status: PlanStatus; features: string[] }
type Props = { page: AdminPlatformPage; onNotify?: (message: string) => void }

const emptyCmsSettings: CmsSettings = { releaseTitle: '', announcementEnabled: false, heroHeading: '', heroSupport: '' }

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include', headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || `Request failed (${response.status}).`)
  return payload
}

export default function AdminPlatformPages({ page, onNotify }: Props) {
  return page === 'CMS' ? <CmsSettingsPage onNotify={onNotify}/> : <SubscriptionPlansPage onNotify={onNotify}/>
}

function CmsSettingsPage({ onNotify }: { onNotify?: (message: string) => void }) {
  const [settings, setSettings] = useState<CmsSettings>(emptyCmsSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError(''); setSavedMessage('')
    try {
      const result = await apiRequest<{ settings?: CmsSettings }>('/api/admin/cms-settings')
      setSettings(result.settings ?? emptyCmsSettings)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load website content settings.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const update = <K extends keyof CmsSettings>(key: K, value: CmsSettings[K]) => { setSettings((current) => ({ ...current, [key]: value })); setSavedMessage('') }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setSavedMessage('')
    try {
      const result = await apiRequest<{ settings?: CmsSettings; message?: string }>('/api/admin/cms-settings', { method: 'PUT', body: JSON.stringify({ settings }) })
      if (result.settings) setSettings(result.settings)
      setSavedMessage(result.message || 'Website copy saved.')
      onNotify?.('Website content settings saved.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save website content settings.') }
    finally { setSaving(false) }
  }
  return <section className="ap-page">
    <header className="ap-heading"><div><span className="ap-kicker"><FileText size={14}/> WEBSITE CONTENT</span><h2>Content management</h2><p>Manage the public homepage headline and upcoming exam announcement.</p></div><button className="ws-button ws-light" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={14}/> Refresh</button></header>
    <div className="ap-notice"><CircleAlert size={17}/><span><strong>Saving updates the shared website copy.</strong><small>Check the live preview before saving. Changes appear to marketplace visitors as soon as they are saved.</small></span></div>
    {error && <div className="ap-error" role="alert"><CircleAlert size={16}/>{error}<button onClick={() => void load()}>Retry</button></div>}
    {loading ? <div className="ap-empty"><RefreshCw size={18}/><strong>Loading content settings…</strong></div> : <div className="ap-cms-layout"><form className="ap-card ap-cms-form" onSubmit={(event) => void save(event)}><div className="ap-card-heading"><span className="ap-icon ap-blue"><FileText size={17}/></span><div><h3>Homepage campaign</h3><p>Update the copy used in the hero and announcement banner.</p></div></div>
      <label className="ap-switch-row"><span><strong>Show upcoming exam announcement</strong><small>Show or hide the top announcement on the public site.</small></span><input type="checkbox" checked={settings.announcementEnabled} onChange={(event) => update('announcementEnabled', event.target.checked)}/></label>
      <label>Announcement title<input maxLength={120} value={settings.releaseTitle} onChange={(event) => update('releaseTitle', event.target.value)} placeholder="e.g. 2027 Term 1 Midterm Exam" required/></label>
      <label>Hero heading<input maxLength={140} value={settings.heroHeading} onChange={(event) => update('heroHeading', event.target.value)} placeholder="Homepage headline" required/></label>
      <label>Supporting text<textarea rows={3} maxLength={260} value={settings.heroSupport} onChange={(event) => update('heroSupport', event.target.value)} placeholder="Short supporting copy for learners and schools" required/></label>
      <div className="ap-actions"><button type="submit" className="ws-button ws-primary" disabled={saving || loading}>{saving ? 'Saving…' : <><Save size={14}/> Save and publish</>}</button></div>
      {savedMessage && <p className="ap-inline-success" role="status"><Check size={14}/>{savedMessage}</p>}
    </form><aside className="ap-card ap-preview"><span className="ap-kicker">PUBLIC PAGE PREVIEW</span><div className="ap-preview-banner"><span>UPCOMING EXAM</span><strong>{settings.announcementEnabled ? settings.releaseTitle || 'No announcement title' : 'Announcement hidden'}</strong></div><div className="ap-preview-hero"><small>GUARDIAN EXAMS</small><h3>{settings.heroHeading || 'Homepage headline'}</h3><p>{settings.heroSupport || 'Supporting copy will appear here.'}</p><button type="button" disabled>Explore papers <ArrowRight size={14}/></button></div><small className="ap-preview-caption">Preview reflects the current server settings.</small></aside></div>}
  </section>
}

function SubscriptionPlansPage({ onNotify }: { onNotify?: (message: string) => void }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError(''); setSavedMessage('')
    try { const result = await apiRequest<{ plans?: SubscriptionPlan[] }>('/api/admin/subscription-plans'); setPlans(result.plans ?? []) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load subscription plans.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const updatePlan = (id: string, changes: Partial<SubscriptionPlan>) => { setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...changes } : plan)); setSavedMessage('') }
  const addPlan = () => { setPlans((current) => [...current, { id: `draft-${crypto.randomUUID()}`, name: '', description: '', priceKes: 0, billingInterval: 'month', status: 'draft', features: [] }]); setSavedMessage('') }
  const removePlan = (id: string) => setPlans((current) => current.filter((plan) => plan.id !== id))
  const save = async () => {
    setSaving(true); setError(''); setSavedMessage('')
    try {
      const result = await apiRequest<{ plans?: SubscriptionPlan[]; message?: string }>('/api/admin/subscription-plans', { method: 'PUT', body: JSON.stringify({ plans: plans.map(({ id, ...plan }) => ({ ...(id.startsWith('draft-') ? {} : { id }), ...plan })) }) })
      setPlans(result.plans ?? [])
      setSavedMessage(result.message || 'Subscription plan definitions saved.')
      onNotify?.('Subscription plan definitions saved.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save subscription plans.') }
    finally { setSaving(false) }
  }
  return <section className="ap-page">
    <header className="ap-heading"><div><span className="ap-kicker">ACCESS & BILLING</span><h2>Subscription plans</h2><p>Define plan names, prices, billing periods, features, and whether each plan is available to customers.</p></div><button className="ws-button ws-light" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={14}/> Refresh</button></header>
    <div className="ap-notice"><CircleAlert size={17}/><span><strong>Subscription billing must be configured before activating plans.</strong><small>Saving plan records does not charge customers or grant entitlements unless the billing and access services are connected.</small></span></div>
    {error && <div className="ap-error" role="alert"><CircleAlert size={16}/>{error}<button onClick={() => void load()}>Retry</button></div>}
    <div className="ap-plan-toolbar"><span>{plans.length} plan{plans.length === 1 ? '' : 's'}</span><button className="ws-button ws-light" onClick={addPlan} disabled={loading || saving}><Plus size={14}/> Add plan</button></div>
    {loading ? <div className="ap-empty"><RefreshCw size={18}/><strong>Loading subscription plans…</strong></div> : plans.length === 0 ? <div className="ap-empty"><CreditCard size={20}/><strong>No subscription plans configured</strong><span>Add a plan when pricing and subscription access rules are ready.</span><button className="ws-button ws-primary" onClick={addPlan}><Plus size={14}/> Create first plan</button></div> : <div className="ap-plan-list">{plans.map((plan) => <article className="ap-card ap-plan-card" key={plan.id}><div className="ap-plan-header"><strong>{plan.name || 'New plan'}</strong><select aria-label={`${plan.name || 'New plan'} status`} value={plan.status} onChange={(event) => updatePlan(plan.id, { status: event.target.value as PlanStatus })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select><button className="ap-delete" aria-label={`Remove ${plan.name || 'new plan'}`} onClick={() => removePlan(plan.id)}><Trash2 size={15}/></button></div><div className="ap-plan-fields"><label>Plan name<input value={plan.name} onChange={(event) => updatePlan(plan.id, { name: event.target.value })} placeholder="e.g. Family"/></label><label>Description<input value={plan.description} onChange={(event) => updatePlan(plan.id, { description: event.target.value })} placeholder="Who is this plan for?"/></label><label>Price (KSh/month)<input type="number" min="0" step="1" value={plan.priceKes ?? ''} onChange={(event) => updatePlan(plan.id, { priceKes: event.target.value === '' ? null : Number(event.target.value) })}/></label><label>Billing interval<select value={plan.billingInterval} onChange={(event) => updatePlan(plan.id, { billingInterval: event.target.value })}><option value="month">Monthly</option><option value="year">Yearly</option><option value="one_time">One time</option></select></label><label className="ap-plan-features">Features <small>Separate features with commas.</small><input value={plan.features.join(', ')} onChange={(event) => updatePlan(plan.id, { features: event.target.value.split(',').map((feature) => feature.trim()).filter(Boolean) })} placeholder="Progress reports, saved papers"/></label></div></article>)}</div>}
    {!loading && plans.length > 0 && <div className="ap-actions ap-plan-save"><button className="ws-button ws-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : <><Save size={14}/> Save plan definitions</>}</button>{savedMessage && <p className="ap-inline-success" role="status"><Check size={14}/>{savedMessage}</p>}</div>}
  </section>
}
