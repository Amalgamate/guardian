import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, CircleAlert, ClipboardCheck, Clock3, FileText, Plus, RefreshCw, Save, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { assessmentApi, type AssessmentAttempt, type AssessmentQuestionInput, type AssessmentQuestionType, type AssessmentResult, type LearnerAssessment, type TeacherAssessment } from './assessmentApi'
import './connected-assessment.css'

type Mode = 'teacher' | 'learner' | 'results' | 'parent-results'
type DraftQuestion = { prompt: string; type: AssessmentQuestionType; optionsText: string; correctAnswer: string; markingGuide: string; explanation: string; marks: string }
const emptyQuestion: DraftQuestion = { prompt: '', type: 'choice', optionsText: 'Option A\nOption B', correctAnswer: 'Option A', markingGuide: '', explanation: '', marks: '1' }

export default function ConnectedAssessmentFlow({ mode, onNotify }: { mode: Mode; onNotify: (message: string) => void }) {
  const [assessments, setAssessments] = useState<TeacherAssessment[]>([])
  const [queue, setQueue] = useState<AssessmentAttempt[]>([])
  const [learnerAssessments, setLearnerAssessments] = useState<LearnerAssessment[]>([])
  const [results, setResults] = useState<AssessmentResult[]>([])
  const [linkedLearners, setLinkedLearners] = useState<Array<{ id: string; fullName: string }>>([])
  const [selectedLearner, setSelectedLearner] = useState('')
  const [activeAttempt, setActiveAttempt] = useState<AssessmentAttempt | null>(null)
  const [activeTeacherAttempt, setActiveTeacherAttempt] = useState<AssessmentAttempt | null>(null)
  const [currentAssessment, setCurrentAssessment] = useState<LearnerAssessment & { id?: string } | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [teacherMarks, setTeacherMarks] = useState<Record<string, { score: string; feedback: string }>>({})
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ ...emptyQuestion }])
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [duration, setDuration] = useState('30')
  const [assessmentMode, setAssessmentMode] = useState<'practice' | 'exam'>('practice')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'assessments' | 'marking'>('assessments')
  const [submittedReceipt, setSubmittedReceipt] = useState<{ autoScore: number; maximumScore: number; manualQuestionCount: number } | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (mode === 'teacher') {
        const [created, pending] = await Promise.all([assessmentApi.teacherAssessments(), assessmentApi.markingQueue()])
        setAssessments(created.assessments); setQueue(pending.attempts)
      } else if (mode === 'learner') {
        setLearnerAssessments((await assessmentApi.learnerAssessments()).assessments)
      } else if (mode === 'results') {
        setResults((await assessmentApi.learnerResults()).results)
      } else {
        const learners = (await assessmentApi.parentLearners()).learners
        setLinkedLearners(learners)
        const learnerId = selectedLearner && learners.some((learner) => learner.id === selectedLearner) ? selectedLearner : learners[0]?.id || ''
        setSelectedLearner(learnerId)
        setResults(learnerId ? (await assessmentApi.parentResults(learnerId)).results : [])
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load assessment records.') }
    finally { setLoading(false) }
  }, [mode, selectedLearner])

  useEffect(() => { void refresh() }, [refresh])

  const createAssessment = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const prepared: AssessmentQuestionInput[] = questions.map((question) => {
        const options = question.optionsText.split('\n').map((item) => item.trim()).filter(Boolean)
        let correctAnswer: AssessmentQuestionInput['correctAnswer']
        if (question.type === 'multi') correctAnswer = question.correctAnswer.split(',').map((item) => item.trim()).filter(Boolean)
        else if (question.type === 'number') correctAnswer = Number(question.correctAnswer)
        else if (question.type === 'ordering') correctAnswer = question.correctAnswer.split('\n').map((item) => item.trim()).filter(Boolean)
        else if (question.type === 'matching') correctAnswer = JSON.parse(question.correctAnswer || '{}') as string[]
        else if (question.type !== 'essay') correctAnswer = question.correctAnswer
        return { prompt: question.prompt.trim(), type: question.type, options, correctAnswer, markingGuide: question.markingGuide, explanation: question.explanation, marks: Number(question.marks) }
      })
      const created = await assessmentApi.createAssessment({ title, instructions, mode: assessmentMode, durationMinutes: Number(duration), questions: prepared })
      await assessmentApi.publishAssessment(created.assessment.id)
      setNotice(`Published. Learners can join with code ${created.assessment.joinCode}.`)
      setTitle(''); setInstructions(''); setQuestions([{ ...emptyQuestion }]); await refresh()
      onNotify('Assessment published with a learner join code.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this assessment.') }
    finally { setBusy(false) }
  }

  const startAssessment = async (assessment: LearnerAssessment) => {
    setBusy(true); setError(''); setNotice(''); setSubmittedReceipt(null)
    try {
      const response = await assessmentApi.startAttempt(assessment.joinCode)
      setCurrentAssessment({ ...response.assessment, id: response.assessment.id })
      const loaded = await assessmentApi.learnerAttempt(response.attempt.id)
      setActiveAttempt({ ...loaded.attempt, questions: response.questions })
      setAnswers(loaded.attempt.answers || {})
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start the assessment.') }
    finally { setBusy(false) }
  }

  const lookup = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { const response = await assessmentApi.lookupAssessment(joinCode.trim()); await startAssessment(response.assessment) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not find this assessment.') }
    finally { setBusy(false) }
  }

  const saveAnswers = async () => {
    if (!activeAttempt) return
    setBusy(true); setError('')
    try { const result = await assessmentApi.saveAnswers(activeAttempt.id, answers); setNotice(`Answers saved at ${new Date(result.savedAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save answers.') }
    finally { setBusy(false) }
  }

  const submitAttempt = async () => {
    if (!activeAttempt) return
    setBusy(true); setError('')
    try {
      await assessmentApi.saveAnswers(activeAttempt.id, answers)
      const response = await assessmentApi.submitAttempt(activeAttempt.id)
      setSubmittedReceipt(response.result); setActiveAttempt(null); setCurrentAssessment(null); setNotice(response.message); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit this assessment.') }
    finally { setBusy(false) }
  }

  const openMarking = async (attemptId: string) => {
    setBusy(true); setError('')
    try { const { attempt } = await assessmentApi.teacherAttempt(attemptId); setActiveTeacherAttempt(attempt); setTeacherMarks(Object.fromEntries(attempt.questions.filter((question) => question.type === 'essay').map((question) => [question.id, { score: String(question.awardedMarks ?? 0), feedback: question.feedback || '' }]))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load this submission.') }
    finally { setBusy(false) }
  }

  const saveMark = async (questionId: string) => {
    if (!activeTeacherAttempt) return
    const mark = teacherMarks[questionId] || { score: '0', feedback: '' }
    setBusy(true); setError('')
    try { await assessmentApi.markResponse(activeTeacherAttempt.id, questionId, Number(mark.score), mark.feedback); const { attempt } = await assessmentApi.teacherAttempt(activeTeacherAttempt.id); setActiveTeacherAttempt(attempt); onNotify('Written response mark saved.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the mark.') }
    finally { setBusy(false) }
  }

  const publishResult = async () => {
    if (!activeTeacherAttempt) return
    setBusy(true); setError('')
    try { await assessmentApi.publishResult(activeTeacherAttempt.id); setActiveTeacherAttempt(null); setTab('marking'); await refresh(); onNotify('Assessment result published to the learner account.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not publish this result.') }
    finally { setBusy(false) }
  }

  if (mode === 'teacher') return <section className="ca-workspace">
    <header className="ca-heading"><div><span className="ca-eyebrow">ASSESSMENTS & MARKING</span><h2>Build, mark and publish</h2><p>Objective answers are scored automatically. Written responses wait for teacher review before results are released.</p></div><span className="ca-demo-badge"><Sparkles size={14}/> Database-backed workflow</span></header>
    {error && <div className="ca-alert" role="alert"><CircleAlert size={16}/>{error}</div>}{notice && <div className="ca-notice" role="status"><Check size={16}/>{notice}</div>}
    {activeTeacherAttempt ? <section className="ca-card"><div className="ca-card-head"><div><span className="ca-eyebrow">TEACHER REVIEW</span><h3>{activeTeacherAttempt.learnerName} · {activeTeacherAttempt.assessmentTitle}</h3><p>Auto-marked {activeTeacherAttempt.autoScore} of {activeTeacherAttempt.maximumScore} available marks.</p></div><button className="ca-button" onClick={() => setActiveTeacherAttempt(null)}><ArrowLeft size={14}/> Back to queue</button></div>
      <div className="ca-question-list">{activeTeacherAttempt.questions.map((question) => <article className="ca-question-card" key={question.id}><div className="ca-question-head"><strong>Question {question.position} · {question.marks} marks</strong><span className={`ca-tag ${question.type === 'essay' ? 'manual' : 'auto'}`}>{question.type === 'essay' ? 'Teacher review' : 'Auto-marked'}</span></div><p>{question.prompt}</p><div className="ca-answer-box"><small>LEARNER ANSWER</small><strong>{formatAnswer(activeTeacherAttempt.answers?.[question.id]) || 'No answer'}</strong></div>{question.type === 'essay' ? <><div className="ca-guide"><small>MARKING GUIDANCE</small><p>{question.markingGuide}</p></div><div className="ca-mark-fields"><label>Marks awarded<input type="number" min="0" max={question.marks} step="0.5" value={teacherMarks[question.id]?.score ?? '0'} onChange={(e) => setTeacherMarks({ ...teacherMarks, [question.id]: { ...(teacherMarks[question.id] || { feedback: '' }), score: e.target.value } })}/><span>of {question.marks}</span></label><label>Feedback<textarea rows={2} value={teacherMarks[question.id]?.feedback || ''} onChange={(e) => setTeacherMarks({ ...teacherMarks, [question.id]: { ...(teacherMarks[question.id] || { score: '0' }), feedback: e.target.value } })} placeholder="Explain the mark and one next step."/></label><button className="ca-button ca-primary" disabled={busy} onClick={() => void saveMark(question.id)}><Save size={14}/> Save mark</button></div></> : <div className="ca-auto-feedback"><Check size={14}/> Answer-key mark is recorded automatically.</div>}</article>)}</div><div className="ca-actions"><button className="ca-button ca-primary" disabled={busy} onClick={() => void publishResult()}><Send size={14}/> Publish result</button></div>
    </section> : <><nav className="ca-tabs"><button className={tab === 'assessments' ? 'active' : ''} onClick={() => setTab('assessments')}><BookOpenCheck size={15}/> Assessments ({assessments.length})</button><button className={tab === 'marking' ? 'active' : ''} onClick={() => setTab('marking')}><ClipboardCheck size={15}/> Marking queue ({queue.length})</button><button className="ca-button ca-refresh" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></nav>
    {loading ? <div className="ca-card ca-empty">Loading your assessment data…</div> : tab === 'assessments' ? <div className="ca-teacher-grid"><form className="ca-card ca-builder" onSubmit={(event) => void createAssessment(event)}><div className="ca-card-head"><div><h3>Create an assessment</h3><p>Published assessments get a unique learner join code.</p></div></div><label>Assessment title<input required minLength={4} maxLength={180} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grade 8 Mathematics · Term 2"/></label><label>Instructions<textarea rows={2} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Tell learners what to do before they begin."/></label><div className="ca-inline-fields"><label>Mode<select value={assessmentMode} onChange={(e) => setAssessmentMode(e.target.value as 'practice' | 'exam')}><option value="practice">Practice</option><option value="exam">Timed exam</option></select></label><label>Minutes<input type="number" min="1" max="360" value={duration} onChange={(e) => setDuration(e.target.value)}/></label></div><div className="ca-section-title"><h4>Questions</h4><button type="button" className="ca-button" onClick={() => setQuestions([...questions, { ...emptyQuestion }])}><Plus size={14}/> Add question</button></div>{questions.map((question,index)=><article className="ca-draft-question" key={index}><div className="ca-section-title"><strong>Question {index+1}</strong>{questions.length>1&&<button type="button" className="ca-remove" onClick={()=>setQuestions(questions.filter((_,i)=>i!==index))}>Remove</button>}</div><label>Prompt<textarea required rows={2} value={question.prompt} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,prompt:e.target.value}:q))}/></label><div className="ca-inline-fields"><label>Type<select value={question.type} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,type:e.target.value as AssessmentQuestionType}:q))}>{(['choice','multi','boolean','short','number','matching','ordering','essay'] as AssessmentQuestionType[]).map((type)=><option key={type} value={type}>{type}</option>)}</select></label><label>Marks<input type="number" min="0.5" step="0.5" value={question.marks} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,marks:e.target.value}:q))}/></label></div>{['choice','multi','boolean'].includes(question.type)&&<label>Options · one per line<textarea rows={3} value={question.optionsText} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,optionsText:e.target.value}:q))}/></label>}{question.type!=='essay'&&<label>{question.type==='multi'?'Correct answers · comma-separated':question.type==='ordering'?'Correct order · one per line':question.type==='matching'?'Answer key · JSON': 'Correct answer'}<input required value={question.correctAnswer} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,correctAnswer:e.target.value}:q))}/></label>}{question.type==='essay'&&<label>Marking guide<textarea required rows={2} value={question.markingGuide} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,markingGuide:e.target.value}:q))}/></label>}<label>Explanation shown after results<textarea rows={2} value={question.explanation} onChange={(e)=>setQuestions(questions.map((q,i)=>i===index?{...q,explanation:e.target.value}:q))}/></label></article>)}<button className="ca-button ca-primary" type="submit" disabled={busy}>{busy?'Publishing…':'Save & publish assessment'} <Send size={14}/></button><small className="ca-footnote">A random join code is shown after publishing. No email, SMS or external message is sent.</small></form>
      <section className="ca-card"><div className="ca-card-head"><div><h3>Your assessments</h3><p>PostgreSQL records · share the join code with your learners.</p></div><button className="ca-button" onClick={()=>void refresh()}><RefreshCw size={14}/></button></div>{assessments.length===0?<div className="ca-empty"><FileText size={20}/><strong>No assessments yet</strong><span>Create one using the form.</span></div>:<div className="ca-record-list">{assessments.map((assessment)=><article className="ca-record" key={assessment.id}><div><strong>{assessment.title}</strong><small>{assessment.questionCount} questions · {assessment.attemptCount} attempts · {assessment.mode}</small></div><span className={`ca-tag ${assessment.status}`}>{assessment.status}</span><div className="ca-code"><small>LEARNER JOIN CODE</small><b>{assessment.joinCode}</b></div>{assessment.status==='published'&&<button className="ca-button" onClick={async()=>{setBusy(true);try{await assessmentApi.closeAssessment(assessment.id);await refresh();onNotify('Assessment closed to new attempts.')}catch(reason){setError(reason instanceof Error?reason.message:'Could not close assessment.')}finally{setBusy(false)}}}>Close assessment</button>}</article>)}</div>}</section></div> : queue.length===0?<div className="ca-card ca-empty"><ClipboardCheck size={22}/><strong>No submitted work awaiting marking</strong><span>When learners submit written answers, they’ll appear here.</span></div>:<div className="ca-card"><div className="ca-card-head"><div><h3>Submitted learner work</h3><p>Objective items are already scored; written responses require review.</p></div></div><div className="ca-record-list">{queue.map((attempt)=><article className="ca-record ca-queue-record" key={attempt.id}><div><strong>{attempt.learnerName} · {attempt.assessmentTitle}</strong><small>Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString('en-KE') : 'recently'} · Auto-score {attempt.autoScore}/{attempt.maximumScore}</small></div><span className="ca-tag manual">{attempt.markedQuestionCount}/{attempt.manualQuestionCount} written marks</span><button className="ca-button ca-primary" onClick={()=>void openMarking(attempt.id)}>Review submission <ArrowRight size={14}/></button></article>)}</div></div>}</>}
  </section>

  if (mode === 'learner') return <section className="ca-workspace"><header className="ca-heading"><div><span className="ca-eyebrow">LEARNER ASSESSMENTS</span><h2>{activeAttempt ? currentAssessment?.title : 'Find an assessment'}</h2><p>{activeAttempt ? currentAssessment?.instructions || 'Answer each question, save your work, then submit when ready.' : 'Open a published assessment from your teacher using its join code.'}</p></div>{activeAttempt && currentAssessment && <span className="ca-demo-badge"><Clock3 size={14}/> {currentAssessment.mode==='exam'?`${currentAssessment.durationMinutes} minute exam`:'Practice'}</span>}</header>
    {error&&<div className="ca-alert" role="alert"><CircleAlert size={16}/>{error}</div>}{notice&&<div className="ca-notice" role="status"><Check size={16}/>{notice}</div>}
    {submittedReceipt ? <section className="ca-card ca-receipt"><span className="ca-result-icon"><Check size={24}/></span><span className="ca-eyebrow">SUBMISSION RECEIVED</span><h3>Your answers are submitted</h3><p>Automated score: <strong>{submittedReceipt.autoScore} / {submittedReceipt.maximumScore}</strong>. {submittedReceipt.manualQuestionCount ? `${submittedReceipt.manualQuestionCount} written response(s) are waiting for teacher marking.` : 'Your teacher will publish the result when ready.'}</p><button className="ca-button ca-primary" onClick={()=>{setSubmittedReceipt(null);void refresh()}}>Return to assessments</button></section> : activeAttempt ? <div className="ca-card ca-attempt"><div className="ca-card-head"><div><h3>{activeAttempt.questions.length} questions · {activeAttempt.maximumScore} marks</h3><p>Your work saves to your signed-in learner account.</p></div><button className="ca-button" onClick={()=>void saveAnswers()} disabled={busy}><Save size={14}/> Save answers</button></div>{activeAttempt.questions.map((question,index)=><article className="ca-question-card" key={question.id}><div className="ca-question-head"><strong>Question {index+1} · {question.marks} {Number(question.marks)===1?'mark':'marks'}</strong><span className="ca-tag">{question.type}</span></div><p>{question.prompt}</p><LearnerAnswer question={question} value={answers[question.id]} onChange={(value)=>setAnswers({...answers,[question.id]:value})}/></article>)}<div className="ca-actions"><button className="ca-button" disabled={busy} onClick={()=>void saveAnswers()}><Save size={14}/> Save answers</button><button className="ca-button ca-primary" disabled={busy} onClick={()=>void submitAttempt()}>Submit assessment <Send size={14}/></button></div></div> : <><form className="ca-card ca-code-form" onSubmit={(event)=>void lookup(event)}><div><BookOpenCheck size={22}/><h3>Join with a code</h3><p>Ask your teacher for the 10-character assessment code.</p></div><label>Assessment code<input required maxLength={10} minLength={10} value={joinCode} onChange={(e)=>setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4E5"/></label><button className="ca-button ca-primary" disabled={busy}>Find assessment <ArrowRight size={14}/></button></form>{loading?<div className="ca-card ca-empty">Loading published assessments…</div>:learnerAssessments.length>0&&<section className="ca-card"><div className="ca-card-head"><div><h3>Available assessments</h3><p>Published by your teachers.</p></div><button className="ca-button" onClick={()=>void refresh()}><RefreshCw size={14}/></button></div><div className="ca-record-list">{learnerAssessments.map((assessment)=><article className="ca-record" key={assessment.joinCode}><div><strong>{assessment.title}</strong><small>{assessment.mode} · {assessment.durationMinutes} minutes</small></div><button className="ca-button ca-primary" disabled={busy} onClick={()=>void startAssessment(assessment)}>{assessment.attemptId?'Continue':'Start assessment'} <ArrowRight size={14}/></button></article>)}</div></section>}</>}
  </section>

  return <section className="ca-workspace"><header className="ca-heading"><div><span className="ca-eyebrow">{mode==='parent-results'?'FAMILY LEARNING REPORTS':'ASSESSMENT RESULTS'}</span><h2>{mode==='parent-results'?'Linked learner results':'Your published results'}</h2><p>Results appear here after the teacher finishes review and publishes them.</p></div><button className="ca-button" onClick={()=>void refresh()}><RefreshCw size={14}/> Refresh</button></header>{error&&<div className="ca-alert" role="alert"><CircleAlert size={16}/>{error}</div>}{mode==='parent-results'&&linkedLearners.length>0&&<label className="ca-learner-picker">Learner<select value={selectedLearner} onChange={(event)=>setSelectedLearner(event.target.value)}>{linkedLearners.map((learner)=><option key={learner.id} value={learner.id}>{learner.fullName}</option>)}</select></label>}{loading?<div className="ca-card ca-empty">Loading results…</div>:results.length===0?<div className="ca-card ca-empty"><FileText size={22}/><strong>No published results yet</strong><span>Completed and teacher-published assessments will appear here.</span></div>:<div className="ca-results-grid">{results.map((result)=><article className="ca-card ca-result-card" key={result.attemptId}><span className="ca-result-icon"><Check size={19}/></span><div><h3>{result.title}</h3><p>{result.mode} · Published {new Date(result.publishedAt).toLocaleDateString('en-KE')}</p></div><strong>{result.score} <small>/ {result.maximumScore}</small></strong><span className="ca-percent">{result.percentage}%</span><div className="ca-score-bar"><i style={{width:`${Math.min(100,Math.max(0,Number(result.percentage)))}%`}}/></div><small className="ca-footnote">Auto-marked {result.autoScore} · Teacher reviewed {result.teacherScore}</small></article>)}</div>}<div className="ca-footnote"><ShieldCheck size={15}/> Results are private to the learner and approved linked parents.</div></section>
}

function LearnerAnswer({ question, value, onChange }: { question: AssessmentAttempt['questions'][number]; value: unknown; onChange: (value: unknown) => void }) {
  if (['choice','boolean'].includes(question.type)) return <label className="ca-answer-input">Your answer<select value={String(value ?? '')} onChange={(event)=>onChange(event.target.value)}><option value="">Choose an answer</option>{(question.options || []).map((option,index)=><option key={index} value={option}>{option}</option>)}</select></label>
  if (question.type === 'multi') return <fieldset className="ca-multi"><legend>Select all that apply</legend>{(question.options || []).map((option,index)=><label key={index}><input type="checkbox" checked={Array.isArray(value)&&value.includes(option)} onChange={(event)=>{const current=Array.isArray(value)?value as string[]:[];onChange(event.target.checked?[...current,option]:current.filter((item)=>item!==option))}}/>{option}</label>)}</fieldset>
  if (question.type === 'number') return <label className="ca-answer-input">Your numerical answer<input type="number" step="any" value={String(value ?? '')} onChange={(event)=>onChange(event.target.value === '' ? '' : Number(event.target.value))}/></label>
  if (question.type === 'essay') return <label className="ca-answer-input">Your response<textarea rows={5} maxLength={12000} value={String(value ?? '')} onChange={(event)=>onChange(event.target.value)} placeholder="Write your response here."/></label>
  if (question.type === 'ordering') return <label className="ca-answer-input">Arrange in order · one item per line<textarea rows={4} value={Array.isArray(value)?value.join('\n'):String(value??'')} onChange={(event)=>onChange(event.target.value.split('\n').map((item)=>item.trim()).filter(Boolean))}/></label>
  if (question.type === 'matching') return <label className="ca-answer-input">Matching response · JSON object<textarea rows={3} value={typeof value==='string'?value:value?JSON.stringify(value):'{}'} onChange={(event)=>{try{onChange(JSON.parse(event.target.value))}catch{onChange(event.target.value)}}}/><small>Example: {`{"term":"definition"}`}</small></label>
  return <label className="ca-answer-input">Your answer<input value={String(value ?? '')} onChange={(event)=>onChange(event.target.value)}/></label>
}

function formatAnswer(value: unknown) { if (value === null || value === undefined || value === '') return ''; return Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value) }
