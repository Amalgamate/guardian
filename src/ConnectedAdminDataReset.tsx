import { useEffect, useState } from 'react'
import { AlertTriangle, Eraser, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import './connected-admin.css'

type ResetPreview = {
  counts: { attempts: number; marks: number; familyLinks: number; messages: number; unpaidOrders: number; inactivePreorders: number }
  keeps: string[]
  deletes: string[]
  archivesOnly: string[]
  deletable: boolean
  warnings: string[]
}

export default function ConnectedAdminDataReset() {
  const [preview, setPreview] = useState<ResetPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/data-reset', { credentials: 'include' })
      const payload = await response.json().catch(() => ({})) as ResetPreview & { error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || 'Could not read the current activity counts.')
      setPreview(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read the current activity counts.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const run = async () => {
    if (!canRun) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/data-reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } }
      if (!response.ok) throw new Error(payload.error?.message || 'Could not clear student activity.')
      setNotice(payload.message || 'Student activity cleared.')
      setConfirmed(false)
      setTyped('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not clear student activity.')
    } finally { setBusy(false) }
  }

  const total = preview ? Object.values(preview.counts).reduce((sum, value) => sum + value, 0) : 0
  const canRun = Boolean(preview?.deletable) && confirmed && typed.trim() === 'CLEAR' && !busy

  return <section className="ws-card ws-data-reset">
    <div className="ws-card-heading">
      <div>
        <span className="ws-kicker">CLEAN SLATE FOR TESTING</span>
        <h2>Student activity</h2>
        <p>Clear what learners and parents produced — attempts, marks, family links and inbox history — without touching accounts, schools or prices.</p>
      </div>
      <button className="ws-button ws-light" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh counts</button>
    </div>

    {error && <div className="ws-admin-empty" role="alert"><strong>Could not complete that action</strong><small>{error}</small></div>}
    {notice && <p className="ws-admin-access-notice" role="status">{notice}</p>}

    {loading ? <div className="ws-admin-empty"><RefreshCw size={17}/><span>Counting student activity…</span></div>
      : preview && <>
        <div className="ws-reset-counts">
          <article><span>Assessment attempts</span><strong>{preview.counts.attempts}</strong><small>deleted with their marks</small></article>
          <article><span>Marked answers</span><strong>{preview.counts.marks}</strong><small>removed with attempts</small></article>
          <article><span>Family links</span><strong>{preview.counts.familyLinks}</strong><small>pending and approved</small></article>
          <article><span>Inbox messages</span><strong>{preview.counts.messages}</strong><small>deleted</small></article>
          <article><span>Unfinished checkouts</span><strong>{preview.counts.unpaidOrders + preview.counts.inactivePreorders}</strong><small>archived, not deleted</small></article>
        </div>

        <div className="ws-reset-columns">
          <div className="ws-reset-column is-kept">
            <strong><ShieldCheck size={15}/> Kept</strong>
            <ul>{preview.keeps.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="ws-reset-column is-removed">
            <strong><Eraser size={15}/> Removed</strong>
            <ul>{preview.deletes.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>

        {total === 0
          ? <div className="ws-delete-state is-clear">This database is already clean — there is no student activity to clear.</div>
          : <>
            {preview.warnings.length > 0 && <div className="ws-delete-warnings">
              <strong><AlertTriangle size={15}/> What this run will do</strong>
              <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>}
            <div className="ws-delete-confirm">
              <label>
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>
                <span>I understand this deletes learner results permanently. Paid orders, accounts and schools are not affected.</span>
              </label>
              <label className="ws-delete-type">
                <span>Type <b>CLEAR</b> to confirm</span>
                <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="CLEAR" autoComplete="off" spellCheck={false} disabled={!confirmed}/>
              </label>
            </div>
            <div className="ws-delete-actions">
              <button className="ws-delete-submit" onClick={() => void run()} disabled={!canRun}>
                {busy ? <><Loader2 size={14} className="ws-delete-spin"/> Clearing…</> : <><Eraser size={14}/> Clear student activity</>}
              </button>
            </div>
          </>}
      </>}
  </section>
}
