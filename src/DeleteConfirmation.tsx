import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react'

export type DeletionBlocker = { code: string; count: number; message: string }
type DeletionReport = { blockers: DeletionBlocker[]; warnings: string[]; deletable: boolean }

const phrases = ['DELETE', 'REMOVE', 'ERASE', 'PURGE', 'WIPE']

export default function DeleteConfirmation({ kind, name, targetId, onCancel, onDeleted }: {
  kind: 'account' | 'institution'
  name: string
  targetId: string
  onCancel: () => void
  onDeleted: (message: string) => void
}) {
  const [report, setReport] = useState<DeletionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const noun = kind === 'account' ? 'account' : 'institution'
  const endpoint = kind === 'account'
    ? `/api/admin/users/${encodeURIComponent(targetId)}`
    : `/api/admin/institutions/${encodeURIComponent(targetId)}`
  const expected = `${name.trim()} ${phrases[0]}`
  const canDelete = Boolean(report?.deletable) && confirmed && typed.trim() === expected && !busy

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`${endpoint}/deletion`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error?.message || `Could not check whether this ${noun} can be deleted.`)
        return payload as DeletionReport
      })
      .then((payload) => { if (live) setReport(payload) })
      .catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not check this record.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [endpoint, noun])

  const remove = async () => {
    if (!canDelete) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string; blockers?: DeletionBlocker[] } }
      if (!response.ok) {
        if (payload.error?.blockers?.length) setReport((current) => ({ blockers: payload.error!.blockers!, warnings: current?.warnings ?? [], deletable: false }))
        throw new Error(payload.error?.message || `Could not delete this ${noun}.`)
      }
      onDeleted(payload.message || `${name} was permanently deleted.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not delete this ${noun}.`)
      setBusy(false)
    }
  }

  return <div className="ws-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div className="ws-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ws-delete-title">
      <div className="ws-delete-head">
        <span className="ws-delete-icon"><ShieldAlert size={20}/></span>
        <div>
          <span className="ws-kicker">PERMANENT DELETION</span>
          <h2 id="ws-delete-title">Delete {noun}: {name}</h2>
        </div>
      </div>

      <p className="ws-delete-lead">This removes the {noun} and its {kind === 'account' ? 'roles, sessions, invitations, inbox messages, wallet and learner links' : 'memberships, invitations, assessments and marketplace listings'} from the database.</p>
      <p className="ws-delete-lead"><strong>It cannot be undone.</strong> Suspending keeps everything and only blocks sign-in — use that if you might need the record again.</p>

      {loading ? <div className="ws-delete-state"><Loader2 size={16} className="ws-delete-spin"/> Checking what depends on this {noun}…</div>
        : error && !report ? <div className="ws-delete-state is-error"><AlertTriangle size={16}/> {error}</div>
        : report && <>
          {report.blockers.length > 0 && <div className="ws-delete-blockers">
            <strong><AlertTriangle size={15}/> Cannot be deleted yet</strong>
            <ul>{report.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul>
            <small>Nothing has been changed. Archive or suspend instead, or clear these records first.</small>
          </div>}
          {report.warnings.length > 0 && <div className="ws-delete-warnings">
            <strong>Also removed with this {noun}</strong>
            <ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </div>}
          {report.deletable && report.warnings.length === 0 && <div className="ws-delete-state is-clear">Nothing else depends on this {noun}. It can be deleted safely.</div>}
        </>}

      {report?.deletable && <div className="ws-delete-confirm">
        <label>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>
          <span>I understand this permanently deletes {kind === 'account' ? 'the account and its history' : 'the institution and its memberships'}.</span>
        </label>
        <label className="ws-delete-type">
          <span>Type <b>{expected}</b> to confirm</span>
          <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={expected} autoComplete="off" spellCheck={false} disabled={!confirmed}/>
        </label>
      </div>}

      {error && report && <p className="ws-delete-error" role="alert">{error}</p>}

      <div className="ws-delete-actions">
        <button className="ws-button ws-light" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="ws-delete-submit" onClick={() => void remove()} disabled={!canDelete}>
          {busy ? <><Loader2 size={14} className="ws-delete-spin"/> Deleting…</> : <>Delete {noun} permanently</>}
        </button>
      </div>
    </div>
  </div>
}
