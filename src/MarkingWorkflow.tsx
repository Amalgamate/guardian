import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, FileText, MessageSquareText, Save, Send, Sparkles } from 'lucide-react'
import './marking-workflow.css'

type MarkingStatus = 'Submitted' | 'Draft marking' | 'Published'
type QuestionMark = { score: number; note: string }
type SavedMarking = { answers: Record<string, QuestionMark>; overallFeedback: string; status: MarkingStatus; updatedAt: string }
type Submission = { id: string; learner: string; initials: string; assignment: string; className: string; submitted: string; scoreHint: string }

const submissions: Submission[] = [
  { id: 'sub-akinyi', learner: 'Akinyi Otieno', initials: 'AO', assignment: 'Grade 8 Mathematics · Term 2', className: 'Grade 8 East', submitted: 'Today · 9:42 am', scoreHint: '4 auto-marked · 2 need review' },
  { id: 'sub-brian', learner: 'Brian Kamau', initials: 'BK', assignment: 'Grade 8 Mathematics · Term 2', className: 'Grade 8 East', submitted: 'Today · 8:18 am', scoreHint: '4 auto-marked · 2 need review' },
  { id: 'sub-faith', learner: 'Faith Wanjiku', initials: 'FW', assignment: 'Grade 7 English · Comprehension', className: 'Grade 7 North', submitted: 'Yesterday · 3:06 pm', scoreHint: '2 written responses · review' },
]

const markingQuestions = [
  { id: 'q1', title: 'Question 1 · Fractions', prompt: 'Work out ¾ + ⅖. Give your answer in its simplest form.', answer: '1 3/20', learnerAnswer: '1 3/20', marks: 2, kind: 'auto' as const, scheme: 'Common denominator 20: 15/20 + 8/20 = 23/20.' },
  { id: 'q2', title: 'Question 2 · Factors', prompt: 'Select the two factors of 24.', answer: '6 and 8', learnerAnswer: '6 and 8', marks: 2, kind: 'auto' as const, scheme: 'Both numbers divide 24 exactly.' },
  { id: 'q3', title: 'Question 3 · Number', prompt: 'A class has 30 learners. 40% are absent. How many are present?', answer: '18', learnerAnswer: '18', marks: 2, kind: 'auto' as const, scheme: '40% of 30 is 12 absent; 30 − 12 = 18 present.' },
  { id: 'q4', title: 'Question 4 · Short response', prompt: 'Name one way learners can conserve water at school.', answer: 'Any practical water conservation action', learnerAnswer: 'Turn off taps after washing hands.', marks: 2, kind: 'manual' as const, scheme: 'Award 1 mark for a relevant action and 1 mark for a clear description.' },
  { id: 'q5', title: 'Question 5 · Extended response', prompt: 'Explain why saving water at school helps the wider community.', answer: 'Reasoned response with an explained community benefit', learnerAnswer: 'Saving water keeps more supply available for other learners and families. It can also reduce shortages during dry periods.', marks: 5, kind: 'rubric' as const, scheme: '1 mark each: relevant action, identifies community, explains availability, links to shortages, clear communication.' },
]

const storageKey = 'examify-marking-records'
function loadRecords(): Record<string, SavedMarking> {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, SavedMarking> } catch { return {} }
}
function objectiveScore(answer: string, expected: string, maximum: number) {
  return answer.trim().toLowerCase() === expected.toLowerCase() ? maximum : 0
}

export default function MarkingWorkflow({ onPublished }: { onPublished?: (record: { submissionId: string; learner: string; score: number; maximum: number }) => void }) {
  const [records, setRecords] = useState<Record<string, SavedMarking>>(loadRecords)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeQuestionId, setActiveQuestionId] = useState(markingQuestions[0].id)
  const [toast, setToast] = useState('')
  const [publishDialog, setPublishDialog] = useState(false)
  const [clearDialog, setClearDialog] = useState(false)
  const activeSubmission = submissions.find((item) => item.id === activeId)
  const activeRecord = activeId ? records[activeId] : undefined
  const activeQuestion = markingQuestions.find((item) => item.id === activeQuestionId) ?? markingQuestions[0]
  const maxScore = markingQuestions.reduce((sum, question) => sum + question.marks, 0)
  const markState = activeId ? records[activeId] ?? { answers: Object.fromEntries(markingQuestions.filter((question) => question.kind === 'auto').map((question) => [question.id, { score: objectiveScore(question.learnerAnswer, question.answer, question.marks), note: '' }])) as Record<string, QuestionMark>, overallFeedback: '', status: 'Submitted' as MarkingStatus, updatedAt: '' } : undefined
  const score = useMemo(() => Object.values(markState?.answers ?? {}).reduce((sum, mark) => sum + (Number(mark.score) || 0), 0), [markState])
  const queueCount = submissions.filter((item) => records[item.id]?.status !== 'Published').length

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const updateMark = (questionId: string, update: Partial<QuestionMark>) => {
    if (!activeId) return
    setRecords((current) => {
      const original = current[activeId] ?? markState!
      const next = { ...current, [activeId]: { ...original, answers: { ...original.answers, [questionId]: { ...(original.answers[questionId] ?? { score: 0, note: '' }), ...update } }, updatedAt: new Date().toISOString() } }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }
  const updateFeedback = (value: string) => {
    if (!activeId) return
    setRecords((current) => {
      const original = current[activeId] ?? markState!
      const next = { ...current, [activeId]: { ...original, overallFeedback: value, updatedAt: new Date().toISOString() } }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }
  const saveDraft = () => {
    if (!activeId || !markState) return
    setRecords((current) => {
      const next: Record<string, SavedMarking> = { ...current, [activeId]: { ...markState, status: 'Draft marking' as MarkingStatus, updatedAt: new Date().toISOString() } }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
    notify('Marking saved on this device. You can continue later.')
  }
  const publishMarks = () => {
    if (!activeId || !activeSubmission || !markState) return
    const final = { ...markState, status: 'Published' as const, updatedAt: new Date().toISOString() }
    const next = { ...records, [activeId]: final }
    localStorage.setItem(storageKey, JSON.stringify(next))
    setRecords(next)
    onPublished?.({ submissionId: activeId, learner: activeSubmission.learner, score, maximum: maxScore })
    setPublishDialog(false)
    notify(`Result published to ${activeSubmission.learner}’s demo account.`)
    setActiveId(null)
  }
  const clearDraftMarks = () => {
    if (!activeId) return
    const next = { ...records }
    delete next[activeId]
    localStorage.setItem(storageKey, JSON.stringify(next))
    setRecords(next)
    setClearDialog(false)
    notify('Draft marks and feedback cleared. Objective questions will use their sample auto-score again.')
  }

  if (!activeSubmission || !activeId || !markState) return <section className="marking-workspace">
    <div className="marking-intro"><span className="marking-intro-icon"><ClipboardCheck size={20}/></span><div><span className="marking-eyebrow">ASSESSMENT WORKFLOW</span><h2>Mark, review and publish results</h2><p>Objective responses are scored from the sample answer key. Written work uses a teacher rubric. Learners see results only after you publish.</p></div></div>
    <div className="marking-metrics"><div><span>Awaiting review</span><strong>{queueCount}</strong><small>sample submissions</small></div><div><span>Auto-marked</span><strong>3 / 5</strong><small>objective question types</small></div><div><span>Need your judgement</span><strong>2</strong><small>written responses</small></div></div>
    <div className="marking-queue"><div className="marking-queue-head"><div><h3>Submitted assessments</h3><p>Choose a learner submission to review their answers.</p></div><button className="marking-filter" onClick={() => notify('Showing all sample classes.')}>All classes <span>⌄</span></button></div>{submissions.map((item) => { const status = records[item.id]?.status ?? 'Submitted'; return <article className="marking-queue-item" key={item.id}><span className="marking-avatar">{item.initials}</span><div className="marking-learner"><strong>{item.learner}</strong><small>{item.assignment} · {item.className}</small><small>{item.submitted} · {item.scoreHint}</small></div><span className={`marking-status marking-status-${status.toLowerCase().replace(' ', '-')}`}>{status}</span>{status === 'Published' ? <span className="marking-final-score">{Object.values(records[item.id]?.answers ?? {}).reduce((sum, mark) => sum + mark.score, 0)} / {maxScore}</span> : <button className="marking-open" onClick={() => { setActiveId(item.id); setActiveQuestionId(markingQuestions[0].id) }}>{status === 'Draft marking' ? 'Continue marking' : 'Open submission'} <ArrowRight size={14}/></button>}</article> })}</div>
    <div className="marking-simulation-note"><Sparkles size={15}/><span>Sample learner work and marks are illustrative. Publishing updates only this prototype’s local state; no messages are sent.</span></div>
    {toast && <div className="marking-toast" role="status">{toast}</div>}
  </section>

  const currentMark = markState.answers[activeQuestion.id] ?? { score: 0, note: '' }
  const selectedIndex = markingQuestions.findIndex((question) => question.id === activeQuestion.id)
  const status = activeRecord?.status ?? 'Submitted'
  return <section className="marking-workspace marking-active">
    <button className="marking-back" onClick={() => setActiveId(null)}><ArrowLeft size={15}/> Back to marking queue</button>
    <header className="marking-active-header"><div><span className="marking-eyebrow">{activeSubmission.assignment} · {activeSubmission.className}</span><h2>{activeSubmission.learner}’s submission</h2><p>Submitted {activeSubmission.submitted} · {markingQuestions.length} questions · {maxScore} marks</p></div><div className="marking-score-card"><span>Current score</span><strong>{score}<small> / {maxScore}</small></strong><i><b style={{ width: `${Math.min(100, Math.round(score / maxScore * 100))}%` }}/></i></div></header>
    <div className="marking-main-grid"><nav className="marking-question-list" aria-label="Question marks"><strong>QUESTIONS</strong>{markingQuestions.map((question, index) => { const mark = markState.answers[question.id]; return <button key={question.id} className={activeQuestionId === question.id ? 'selected' : ''} onClick={() => setActiveQuestionId(question.id)}><span className="marking-q-bubble">{index + 1}</span><span><strong>{question.title.split(' · ')[1]}</strong><small>{mark ? `${mark.score} / ${question.marks} marks` : `${question.marks} marks`}</small></span>{question.kind === 'auto' ? <CheckCircle2 size={14} className="auto-check"/> : null}</button> })}</nav>
      <article className="marking-question-card"><div className="marking-q-head"><span className="marking-eyebrow">QUESTION {String(selectedIndex + 1).padStart(2, '0')} · {activeQuestion.kind === 'auto' ? 'AUTO-MARKED' : 'TEACHER REVIEW'}</span><span className="marking-out-of">{activeQuestion.marks} marks available</span></div><h3>{activeQuestion.prompt}</h3><div className="marking-response"><span>LEARNER RESPONSE</span><p>{activeQuestion.learnerAnswer}</p></div><div className="marking-key"><span>MARKING GUIDANCE</span><p><strong>Expected:</strong> {activeQuestion.answer}</p><small>{activeQuestion.scheme}</small></div>{activeQuestion.kind === 'auto' ? <div className={`marking-auto-result ${currentMark.score === activeQuestion.marks ? 'correct' : 'incorrect'}`}><CheckCircle2 size={17}/><span><strong>{currentMark.score === activeQuestion.marks ? 'Correct response' : 'Needs review'}</strong><small>{currentMark.score} of {activeQuestion.marks} marks awarded automatically. You can adjust the score if needed.</small></span><label>Marks<input type="number" min="0" max={activeQuestion.marks} value={currentMark.score} onChange={(e) => updateMark(activeQuestion.id, { score: Math.min(activeQuestion.marks, Math.max(0, Number(e.target.value))) })}/></label></div> : <div className="marking-manual-box"><div className="marking-manual-head"><span><strong>{activeQuestion.kind === 'rubric' ? 'Rubric scoring' : 'Teacher scoring'}</strong><small>Set the awarded marks and explain your feedback.</small></span><label>Marks awarded<input type="number" min="0" max={activeQuestion.marks} value={currentMark.score} onChange={(e) => updateMark(activeQuestion.id, { score: Math.min(activeQuestion.marks, Math.max(0, Number(e.target.value))) })}/><em>/ {activeQuestion.marks}</em></label></div>{activeQuestion.kind === 'rubric' && <div className="marking-rubric">{['Gives a relevant action or idea', 'Identifies who benefits in the community', 'Explains why water is more available', 'Connects conservation with dry-season needs', 'Communicates the explanation clearly'].map((criterion, index) => <label key={criterion}><input type="checkbox" checked={index < currentMark.score} onChange={(e) => updateMark(activeQuestion.id, { score: Math.max(0, Math.min(activeQuestion.marks, currentMark.score + (e.target.checked ? 1 : -1))) })}/><span>{criterion}</span><b>1</b></label>)}</div>}<label className="marking-note-label">Question feedback<textarea rows={3} value={currentMark.note} onChange={(e) => updateMark(activeQuestion.id, { note: e.target.value })} placeholder="Give the learner one useful next step…"/></label></div>}<div className="marking-q-nav"><button className="marking-secondary" disabled={selectedIndex === 0} onClick={() => setActiveQuestionId(markingQuestions[selectedIndex - 1].id)}><ArrowLeft size={14}/> Previous</button><button className="marking-primary" onClick={() => selectedIndex < markingQuestions.length - 1 ? setActiveQuestionId(markingQuestions[selectedIndex + 1].id) : setActiveQuestionId(markingQuestions[0].id)}>{selectedIndex === markingQuestions.length - 1 ? 'Review first question' : 'Next question'} <ArrowRight size={14}/></button></div></article>
    </div>
    <section className="marking-feedback-panel"><div><span className="marking-feedback-icon"><MessageSquareText size={17}/></span><span><strong>Overall learner feedback</strong><small>Shared with the learner when results are published.</small></span></div><textarea rows={3} value={markState.overallFeedback} onChange={(e) => updateFeedback(e.target.value)} placeholder="Summarize strengths and one revision focus…"/><div className="marking-footer"><span className={`marking-status marking-status-${status.toLowerCase().replace(' ', '-')}`}>{status}</span><span className="marking-footer-spacer"/><button className="marking-secondary" disabled={status === 'Published'} onClick={() => setClearDialog(true)}>Clear marks</button><button className="marking-secondary" disabled={status === 'Published'} onClick={saveDraft}><Save size={14}/> Save draft</button><button className="marking-primary" disabled={status === 'Published'} onClick={() => setPublishDialog(true)}><Send size={14}/> Publish results</button></div></section>
    {publishDialog && <div className="marking-modal-backdrop"><div className="marking-modal" role="dialog" aria-modal="true" aria-labelledby="marking-publish-title"><span className="marking-modal-icon"><Check size={18}/></span><h3 id="marking-publish-title">Publish {score} of {maxScore} marks?</h3><p>{activeSubmission.learner} will see the score and your written feedback in their sample results. This action only updates the demo.</p><div><button className="marking-secondary" onClick={() => setPublishDialog(false)}>Keep reviewing</button><button className="marking-primary" onClick={publishMarks}>Publish result</button></div></div></div>}
    {clearDialog && <div className="marking-modal-backdrop"><div className="marking-modal" role="dialog" aria-modal="true" aria-labelledby="marking-clear-title"><span className="marking-modal-icon"><FileText size={17}/></span><h3 id="marking-clear-title">Clear saved marks?</h3><p>This removes this submission’s local draft marks and feedback. Published results are not changed.</p><div><button className="marking-secondary" onClick={() => setClearDialog(false)}>Cancel</button><button className="marking-primary" onClick={clearDraftMarks}>Clear draft marks</button></div></div></div>}
    {toast && <div className="marking-toast" role="status">{toast}</div>}
  </section>
}
