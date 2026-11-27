import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, Check, CircleAlert, Clock3, FileText, RefreshCw, Send, ShieldCheck, WalletCards, X } from 'lucide-react'
import { marketplaceApi, type MarketplaceSubmissionRecord, type SellerSettlement, type SubmissionInput, type TeacherPayout, type WalletBalances } from './marketplaceApi'
import './connected-marketplace.css'

type Mode = 'teacher-submissions' | 'admin-review' | 'teacher-wallet' | 'admin-wallet'
type Draft = { title: string; description: string; curriculum: string; level: string; grade: string; subject: string; productType: 'single_paper' | 'series'; includedSubjects: string; year: string; term: string; type: string; resource: string; price: string; pages: string; questions: string; fileName: string; rightsConfirmed: boolean; interactive: boolean }
const blankDraft: Draft = { title: '', description: '', curriculum: 'CBC', level: 'Junior School', grade: 'Grade 8', subject: 'Mathematics', productType: 'single_paper', includedSubjects: '', year: '2026', term: 'Term 2', type: 'End-term assessment', resource: 'Exam + marking scheme', price: '150', pages: '10', questions: '30', fileName: '', rightsConfirmed: false, interactive: false }

export default function ConnectedMarketplaceWorkspace({ mode, onNotify }: { mode: Mode; onNotify: (message: string) => void }) {
  const [submissions, setSubmissions] = useState<MarketplaceSubmissionRecord[]>([])
  const [settlements, setSettlements] = useState<SellerSettlement[]>([])
  const [payouts, setPayouts] = useState<TeacherPayout[]>([])
  const [balances, setBalances] = useState<WalletBalances>({ pending: 0, available: 0, reserved: 0, paid: 0 })
  const [sharePercent, setSharePercent] = useState(80)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [printMaster, setPrintMaster] = useState<File | null>(null)
  const [seriesSubjects, setSeriesSubjects] = useState<string[]>([])
  const [seriesChecklistConfigured, setSeriesChecklistConfigured] = useState(false)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [adminTab, setAdminTab] = useState<'settlements' | 'payouts'>('settlements')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutPhone, setPayoutPhone] = useState('')
  const [payoutNote, setPayoutNote] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (mode === 'teacher-submissions') {
        setSubmissions((await marketplaceApi.teacherSubmissions()).submissions)
      } else if (mode === 'admin-review') {
        setSubmissions((await marketplaceApi.adminSubmissions('submitted')).submissions)
      } else if (mode === 'teacher-wallet') {
        const wallet = await marketplaceApi.teacherWallet()
        setBalances(wallet.balances)
        setPayouts(wallet.payouts)
        setSettlements(wallet.settlements)
        setSharePercent(wallet.sharePercent)
      } else {
        const [settlementResult, payoutResult] = await Promise.all([marketplaceApi.adminSettlements('pending'), marketplaceApi.adminPayouts('all')])
        setSettlements(settlementResult.settlements)
        setPayouts(payoutResult.payouts)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load marketplace data.')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (mode !== 'teacher-submissions' || draft.productType !== 'series') { setSeriesSubjects([]); setSeriesChecklistConfigured(false); return }
    let active = true
    marketplaceApi.seriesSubjects(draft.curriculum, draft.grade).then((result) => { if (active) { setSeriesSubjects(result.subjects); setSeriesChecklistConfigured(result.configured) } }).catch(() => { if (active) { setSeriesSubjects([]); setSeriesChecklistConfigured(false) } })
    return () => { active = false }
  }, [mode, draft.productType, draft.curriculum, draft.grade])

  const toInput = (): SubmissionInput => ({
    title: draft.title.trim(), description: draft.description.trim(), curriculum: draft.curriculum,
    level: draft.level, grade: draft.grade, subject: draft.productType === 'series' ? 'Complete series' : draft.subject,
    productType: draft.productType, includedSubjects: draft.includedSubjects.split(',').map((item) => item.trim()).filter(Boolean), year: draft.year, term: draft.term,
    type: draft.type, resource: draft.resource, pages: Number(draft.pages), questions: Number(draft.questions),
    formats: [], price: Number(draft.price),
    fileName: null, rightsConfirmed: draft.rightsConfirmed,
  })

  const saveSubmission = async (event: FormEvent, submitForReview: boolean) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const input = toInput()
      const result = editingId
        ? await marketplaceApi.updateSubmission(editingId, input)
        : await marketplaceApi.createSubmission(input)
      const submissionId = result.submission.id
      if (printMaster) await marketplaceApi.uploadPrintMaster(submissionId, printMaster)
      else if (submitForReview && !(editingId ? submissions.find((item) => item.id === submissionId)?.fileUploaded : false)) throw new Error('Upload the actual PDF or ZIP print master before submitting for review.')
      if (submitForReview) await marketplaceApi.submitSubmission(submissionId)
      setDraft(blankDraft)
      setPrintMaster(null)
      setEditingId(null)
      setCreating(false)
      await refresh()
      onNotify(submitForReview ? 'Resource submitted for administrator review.' : 'Draft saved to your account.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the submission.')
    } finally {
      setSaving(false)
    }
  }

  const editSubmission = (item: MarketplaceSubmissionRecord) => {
    setEditingId(item.id)
    setCreating(true)
    setDraft({ title: item.title, description: item.description, curriculum: item.curriculum, level: item.level, grade: item.grade, subject: item.subject, productType: item.productType, includedSubjects: item.includedSubjects.join(', '), year: item.year, term: item.term, type: item.type, resource: item.resource, price: String(item.price), pages: String(item.pages), questions: String(item.questions), fileName: item.fileName || '', rightsConfirmed: item.rightsConfirmed, interactive: item.formats.includes('Digital') })
    setPrintMaster(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submitExisting = async (id: string) => {
    setSaving(true); setError('')
    try {
      const item = submissions.find((record) => record.id === id)
      if (!item?.fileUploaded) throw new Error('Edit this draft and upload its actual PDF or ZIP print master before submitting for review.')
      if (item.productType === 'series') {
        const required = await marketplaceApi.seriesSubjects(item.curriculum, item.grade)
        const included = new Set(item.includedSubjects.map((subject) => subject.toLocaleLowerCase()))
        const missing = required.requiredSubjects.filter((subject) => !included.has(subject.toLocaleLowerCase()))
        if (missing.length) throw new Error(`This series is missing required papers: ${missing.join(', ')}. Edit the draft to add them.`)
      }
      await marketplaceApi.submitSubmission(id); await refresh(); onNotify('Resource submitted for administrator review.')
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit this resource.') }
    finally { setSaving(false) }
  }

  const review = async (item: MarketplaceSubmissionRecord, status: 'approved' | 'changes_requested' | 'rejected') => {
    const note = reviewNotes[item.id] || ''
    if (status !== 'approved' && note.trim().length < 10) { setError('Add at least 10 characters explaining requested changes or rejection.'); return }
    setSaving(true); setError('')
    try { await marketplaceApi.reviewSubmission(item.id, status, note); await refresh(); onNotify(status === 'approved' ? 'Resource approved and published.' : status === 'rejected' ? 'Resource rejected and kept private.' : 'Changes requested; the resource remains private.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the review.') }
    finally { setSaving(false) }
  }

  const requestPayout = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await marketplaceApi.requestPayout(Number(payoutAmount), payoutPhone, payoutNote)
      setPayoutAmount(''); setPayoutNote(''); await refresh(); onNotify(result.message)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit the payout request.') }
    finally { setSaving(false) }
  }

  const approveSettlement = async (settlement: SellerSettlement) => {
    setSaving(true); setError('')
    try { await marketplaceApi.approveSettlement(settlement.id); await refresh(); onNotify('Earnings moved to the teacher’s available wallet.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not approve settlement.') }
    finally { setSaving(false) }
  }

  const reviewPayout = async (payout: TeacherPayout, status: 'approved' | 'rejected') => {
    const note = reviewNotes[payout.id] || ''
    if (status === 'rejected' && note.trim().length < 10) { setError('Add a reason of at least 10 characters before rejecting a payout.'); return }
    setSaving(true); setError('')
    try { const result = await marketplaceApi.reviewPayout(payout.id, status, note); await refresh(); onNotify(result.message) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the payout request.') }
    finally { setSaving(false) }
  }

  const markPaid = async (payout: TeacherPayout) => {
    setSaving(true); setError('')
    try { const result = await marketplaceApi.markPayoutPaid(payout.id); await refresh(); onNotify(result.message) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record the demo payout.') }
    finally { setSaving(false) }
  }

  if (mode === 'teacher-submissions' || mode === 'admin-review') return <section className="cm-workspace">
    <header className="cm-heading"><div><span className="cm-eyebrow">{mode === 'admin-review' ? 'CONTENT MODERATION' : 'TEACHER RESOURCE PUBLISHING'}</span><h2>{mode === 'admin-review' ? 'Marketplace review queue' : 'Submit a resource to the marketplace'}</h2><p>{mode === 'admin-review' ? 'Review teacher content before it becomes visible to buyers.' : 'Add curriculum details, confirm your rights, then send the resource to an administrator for review.'}</p></div>{mode === 'teacher-submissions' && <button className="cm-button cm-primary" onClick={() => { setCreating((value) => !value); setEditingId(null); setDraft(blankDraft) }}>{creating ? 'Close form' : 'New submission'}</button>}</header>
    {error && <div className="cm-alert" role="alert"><CircleAlert size={17}/>{error}</div>}
    {creating && mode === 'teacher-submissions' && <form className="cm-card cm-form" onSubmit={(event) => void saveSubmission(event, true)}>
      <div className="cm-card-head"><div><h3>{editingId ? 'Edit resource details' : 'New marketplace resource'}</h3><p>Upload the print-ready PDF or a ZIP containing the series papers. Buyers order physical copies; files stay private for fulfilment.</p></div><span className="cm-sim-badge">Private print master</span></div>
      <div className="cm-fields">
        <label className="cm-span-two">Resource title<input required minLength={4} maxLength={180} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Grade 8 Mathematics · Term 2 assessment"/></label>
        <label>Curriculum<input required value={draft.curriculum} onChange={(e) => setDraft({ ...draft, curriculum: e.target.value })}/></label>
        <label>Level<input required value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })}/></label>
        <label>Grade / class<input required value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value })}/></label>
        <label>Product type<select value={draft.productType} onChange={(e) => setDraft({ ...draft, productType: e.target.value as Draft['productType'] })}><option value="single_paper">Single paper</option><option value="series">Complete series</option></select></label>
        {draft.productType === 'single_paper' ? <label>Subject<input required value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}/></label> : <fieldset className="cm-span-two"><legend>Papers included in this series</legend>{seriesChecklistConfigured ? seriesSubjects.map((subject) => <label className="cm-check" key={subject}><input type="checkbox" checked={draft.includedSubjects.split(',').map((value) => value.trim()).includes(subject)} onChange={(event) => { const current = draft.includedSubjects.split(',').map((value) => value.trim()).filter(Boolean); const next = event.target.checked ? [...current, subject] : current.filter((value) => value !== subject); setDraft({ ...draft, includedSubjects: next.join(', ') }) }}/><span>{subject}</span></label>) : <small>Subject checklist is not configured for this curriculum and grade. Ask an admin to finish Academic Structure before submitting a series.</small>}<small>Choose every paper actually present in the uploaded ZIP. The server checks that all required grade subjects are included.</small></fieldset>}
        <label>Academic year<input required minLength={4} value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}/></label>
        <label>Term<input required value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })}/></label>
        <label>Assessment type<input required value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}/></label>
        <label>Resource format<input required value={draft.resource} onChange={(e) => setDraft({ ...draft, resource: e.target.value })}/></label>
        <label>Price (KSh)<input required type="number" min="0" max="1000000" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })}/>{draft.productType === 'series' && <small>Complete series use the current grade price from Guardian Exam Pricing.</small>}</label>
        <label>Pages<input type="number" min="0" max="2000" value={draft.pages} onChange={(e) => setDraft({ ...draft, pages: e.target.value })}/></label>
        <label>Questions<input type="number" min="0" max="1000" value={draft.questions} onChange={(e) => setDraft({ ...draft, questions: e.target.value })}/></label>
        <label className="cm-span-two">Resource description<textarea required minLength={20} maxLength={4000} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Explain the learning outcomes and what the buyer receives."/></label>
        <label className="cm-span-two">Actual print master (PDF or ZIP)<input type="file" accept="application/pdf,.pdf,application/zip,.zip" onChange={(event) => setPrintMaster(event.target.files?.[0] || null)} required={!editingId || !submissions.find((item) => item.id === editingId)?.fileUploaded}/><small>{printMaster ? `${printMaster.name} · ${(printMaster.size / 1024 / 1024).toFixed(1)} MB selected` : editingId && submissions.find((item) => item.id === editingId)?.fileUploaded ? `Current file: ${submissions.find((item) => item.id === editingId)?.fileName}. Leave this empty to keep it.` : 'Required. PDF for one paper; ZIP for a complete series. Maximum 50 MB.'}</small></label>
      </div>
      <label className="cm-check"><input type="checkbox" checked={draft.rightsConfirmed} onChange={(e) => setDraft({ ...draft, rightsConfirmed: e.target.checked })}/><span>I confirm I have permission to publish and sell this material.</span></label>
      <div className="cm-actions"><button type="button" className="cm-button" disabled={saving} onClick={(event) => void saveSubmission(event as unknown as FormEvent, false)}>Save draft</button><button type="submit" className="cm-button cm-primary" disabled={saving || !draft.rightsConfirmed}>{saving ? 'Saving…' : 'Submit for review'} <Send size={15}/></button></div>
    </form>}
    {loading ? <div className="cm-card cm-loading"><RefreshCw size={17}/> Loading marketplace records…</div> : <div className="cm-card">
      <div className="cm-card-head"><div><h3>{mode === 'admin-review' ? 'Submissions awaiting action' : 'Your submissions'}</h3><p>{submissions.length} {submissions.length === 1 ? 'resource' : 'resources'} · data from PostgreSQL</p></div><button className="cm-button" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>
      {submissions.length === 0 ? <div className="cm-empty"><FileText size={22}/><strong>{mode === 'admin-review' ? 'No submissions waiting for review' : 'No submissions yet'}</strong><span>{mode === 'admin-review' ? 'Submitted teacher resources will appear here.' : 'Save a draft or submit a resource when it is ready.'}</span></div> : <div className="cm-record-list">{submissions.map((item) => <article className="cm-record" key={item.id}>
        <div className="cm-record-top"><div><h4>{item.title}</h4><p>{item.curriculum} · {item.level} · {item.grade} · {item.subject} · {item.year} {item.term}</p></div><span className={`cm-status cm-status-${item.status}`}>{statusLabel(item.status)}</span></div>
        <p className="cm-description">{item.description}</p><div className="cm-metadata"><span>{item.resource}</span><span>{item.pages} pages</span><span>{item.questions} questions</span><span>KSh {money(item.price)}</span><span>{item.institutionName || item.vendor || 'Teacher'}</span><span>{item.fileUploaded ? `Print master: ${item.fileName}` : 'Print master missing'}</span>{item.productType === 'series' && <span>Included papers: {item.includedSubjects.join(', ')}</span>}</div>
        {item.reviewNote && <div className="cm-review-note"><ShieldCheck size={15}/><span>Admin note: {item.reviewNote}</span></div>}
        {mode === 'teacher-submissions' && ['draft', 'changes_requested'].includes(item.status) && <div className="cm-actions"><button className="cm-button" disabled={saving} onClick={() => editSubmission(item)}>Edit draft</button><button className="cm-button cm-primary" disabled={saving || !item.rightsConfirmed} onClick={() => void submitExisting(item.id)}>Submit for review</button></div>}
        {mode === 'admin-review' && item.status === 'submitted' && <div className="cm-review-controls"><label className="cm-span-two">Review note<textarea rows={2} value={reviewNotes[item.id] || ''} onChange={(e) => setReviewNotes({ ...reviewNotes, [item.id]: e.target.value })} placeholder="Explain changes clearly. Required when requesting changes or rejecting."/></label><div className="cm-actions"><button className="cm-button" disabled={saving} onClick={() => void review(item, 'changes_requested')}>Request changes</button><button className="cm-button cm-danger" disabled={saving} onClick={() => void review(item, 'rejected')}><X size={14}/> Reject</button><button className="cm-button cm-primary" disabled={saving} onClick={() => void review(item, 'approved')}><BadgeCheck size={14}/> Approve & publish</button></div></div>}
      </article>)}</div>}
    </div>}
    <div className="cm-footnote"><ShieldCheck size={16}/> Admin approval is required before any teacher resource becomes publicly listed.</div>
  </section>

  if (mode === 'teacher-wallet') return <section className="cm-workspace">
    <header className="cm-heading"><div><span className="cm-eyebrow">TEACHER EARNINGS</span><h2>Wallet & settlements</h2><p>Track sale proceeds, admin-approved settlements and payout requests.</p></div><span className="cm-sim-badge">Demo ledger · no money transferred</span></header>
    {error && <div className="cm-alert" role="alert"><CircleAlert size={17}/>{error}</div>}
    {loading ? <div className="cm-card cm-loading"><RefreshCw size={17}/> Loading wallet…</div> : <>
      <div className="cm-balance-grid">{(['pending','available','reserved','paid'] as const).map((bucket) => <article className={`cm-balance cm-balance-${bucket}`} key={bucket}><span>{bucketLabel(bucket)}</span><strong>KSh {money(balances[bucket])}</strong><small>{bucketNote(bucket)}</small></article>)}</div>
      <div className="cm-columns"><section className="cm-card"><div className="cm-card-head"><div><h3>Sales & settlements</h3><p>Seller share · {sharePercent}% (illustrative setting)</p></div><button className="cm-button" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>{settlements.length === 0 ? <div className="cm-empty"><FileText size={22}/><strong>No sale settlements yet</strong><span>Approved marketplace purchases will appear here after demo checkout.</span></div> : <div className="cm-table"><div className="cm-table-head"><span>Resource</span><span>Teacher net</span><span>Status</span></div>{settlements.map((settlement) => <article key={settlement.id}><strong>{settlement.title}</strong><b>KSh {money(settlement.amountKes)}</b><span className={`cm-status cm-status-${settlement.status}`}>{statusLabel(settlement.status)}</span></article>)}</div>}</section>
      <form className="cm-card cm-payout-form" onSubmit={(event) => void requestPayout(event)}><div className="cm-card-head"><div><h3>Request a payout</h3><p>Available funds are reserved while an admin reviews your request.</p></div><WalletCards size={22}/></div><label>Amount (KSh)<input required type="number" min="100" max={balances.available} step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder="100"/></label><label>M-PESA number<input required type="tel" value={payoutPhone} onChange={(e) => setPayoutPhone(e.target.value)} placeholder="0712 345 678"/></label><label>Note (optional)<textarea rows={2} maxLength={500} value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} placeholder="Anything the payout reviewer should know"/></label><button className="cm-button cm-primary" type="submit" disabled={saving || balances.available < 100}>{saving ? 'Submitting…' : 'Send for admin approval'} <Send size={15}/></button></form></div>
      <section className="cm-card"><div className="cm-card-head"><div><h3>Payout history</h3><p>All payout requests require administrator approval.</p></div></div>{payouts.length === 0 ? <div className="cm-empty cm-empty-short"><Clock3 size={19}/>No payout requests yet.</div> : <div className="cm-record-list">{payouts.map((payout) => <article className="cm-payout-row" key={payout.id}><div><strong>{payout.destinationPhone}</strong><small>{dateLabel(payout.requestedAt)}{payout.reviewNote ? ` · ${payout.reviewNote}` : ''}</small></div><span className={`cm-status cm-status-${payout.status}`}>{statusLabel(payout.status)}</span><b>KSh {money(payout.amountKes)}</b></article>)}</div>}</section>
    </>}
    <div className="cm-footnote"><ShieldCheck size={16}/> A payout marked processed is a demo record only. No M-PESA transfer is triggered.</div>
  </section>

  return <section className="cm-workspace">
    <header className="cm-heading"><div><span className="cm-eyebrow">PLATFORM FINANCE</span><h2>Teacher settlements & payouts</h2><p>Review earnings and approve withdrawal requests. All ledger activity is auditable.</p></div><span className="cm-sim-badge">No external transfer</span></header>
    {error && <div className="cm-alert" role="alert"><CircleAlert size={17}/>{error}</div>}
    <div className="cm-admin-tabs"><button className={adminTab === 'settlements' ? 'active' : ''} onClick={() => setAdminTab('settlements')}>Sale settlements <span>{settlements.filter((item) => item.status === 'pending').length}</span></button><button className={adminTab === 'payouts' ? 'active' : ''} onClick={() => setAdminTab('payouts')}>Payout requests <span>{payouts.filter((item) => item.status === 'pending').length}</span></button><button className="cm-button cm-refresh" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>
    {loading ? <div className="cm-card cm-loading"><RefreshCw size={17}/> Loading finance queue…</div> : adminTab === 'settlements' ? <section className="cm-card"><div className="cm-card-head"><div><h3>Pending teacher settlements</h3><p>Approval moves net sale earnings from pending to the teacher’s available wallet.</p></div></div>{settlements.filter((item) => item.status === 'pending').length === 0 ? <div className="cm-empty"><Check size={22}/><strong>No settlements waiting</strong><span>New completed demo orders will appear here.</span></div> : <div className="cm-record-list">{settlements.filter((item) => item.status === 'pending').map((item) => <article className="cm-record" key={item.id}><div className="cm-record-top"><div><h4>{item.title}</h4><p>{item.teacherName || 'Teacher'} · {item.institutionName || 'Institution'} · {dateLabel(item.createdAt)}</p></div><strong>KSh {money(item.amountKes)}</strong></div><div className="cm-actions"><button className="cm-button cm-primary" disabled={saving} onClick={() => void approveSettlement(item)}><Check size={14}/> Approve settlement</button></div></article>)}</div>}</section> : <section className="cm-card"><div className="cm-card-head"><div><h3>Payout requests</h3><p>Approve or reject requests; rejected funds return to the teacher’s available balance.</p></div></div>{payouts.length === 0 ? <div className="cm-empty"><Check size={22}/><strong>No payout requests</strong><span>Teacher requests will appear here.</span></div> : <div className="cm-record-list">{payouts.map((payout) => <article className="cm-record" key={payout.id}><div className="cm-record-top"><div><h4>{payout.teacherName || 'Teacher'} · {dateLabel(payout.requestedAt)}</h4><p>{payout.destinationPhone} · {payout.teacherEmail || 'No email on file'}</p></div><strong>KSh {money(payout.amountKes)}</strong></div>{payout.requestNote && <p className="cm-description">{payout.requestNote}</p>}{payout.reviewNote && <div className="cm-review-note">Admin note: {payout.reviewNote}</div>}{payout.status === 'pending' && <div className="cm-review-controls"><label>Review note<textarea rows={2} value={reviewNotes[payout.id] || ''} onChange={(e) => setReviewNotes({ ...reviewNotes, [payout.id]: e.target.value })} placeholder="Required when rejecting"/></label><div className="cm-actions"><button className="cm-button cm-danger" disabled={saving} onClick={() => void reviewPayout(payout, 'rejected')}><X size={14}/> Reject</button><button className="cm-button cm-primary" disabled={saving} onClick={() => void reviewPayout(payout, 'approved')}><Check size={14}/> Approve</button></div></div>}{payout.status === 'approved' && <div className="cm-actions"><button className="cm-button cm-primary" disabled={saving} onClick={() => void markPaid(payout)}><Check size={14}/> Record demo payout as processed</button></div>}<span className={`cm-status cm-status-${payout.status}`}>{statusLabel(payout.status)}</span></article>)}</div>}</section>}
    <div className="cm-footnote"><ShieldCheck size={16}/> Admin approval changes internal ledger state only. It does not initiate an M-PESA transfer.</div>
  </section>
}

function statusLabel(status: string) { return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function bucketLabel(bucket: keyof WalletBalances) { return ({ pending: 'Pending settlement', available: 'Available to withdraw', reserved: 'Reserved for payouts', paid: 'Recorded as paid' })[bucket] }
function bucketNote(bucket: keyof WalletBalances) { return ({ pending: 'Admin must settle sale proceeds', available: 'Can be requested for payout', reserved: 'Awaiting payout decision or processing', paid: 'Historical demo payout records' })[bucket] }
function money(value: string | number) { return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }
function dateLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) }
