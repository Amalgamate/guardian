export type AssessmentQuestionType = 'choice' | 'multi' | 'boolean' | 'short' | 'number' | 'matching' | 'ordering' | 'essay'
export type AssessmentQuestionInput = { prompt: string; type: AssessmentQuestionType; options: string[]; correctAnswer?: string | string[] | number | Record<string, string>; markingGuide?: string; explanation?: string; marks: number }
export type TeacherAssessment = { id: string; joinCode: string; title: string; instructions: string; mode: 'practice' | 'exam'; durationMinutes: number; status: string; questionCount: number; attemptCount: number; publishedAt?: string | null }
export type LearnerAssessment = { joinCode: string; title: string; instructions: string; mode: 'practice' | 'exam'; durationMinutes: number; publishedAt: string; attemptStatus?: string | null; attemptId?: string | null }
export type AssessmentAttemptQuestion = { id: string; position: number; prompt: string; type: AssessmentQuestionType; options: string[]; marks: number; markingGuide?: string; explanation?: string; correctAnswer?: unknown; awardedMarks?: number | null; feedback?: string | null }
export type AssessmentAttempt = { id: string; assessmentId: string; assessmentTitle: string; title?: string; learnerId?: string; learnerName?: string; joinCode?: string; status: string; answers: Record<string, unknown> | null; autoScore: number | null; maximumScore: number; startedAt?: string; submittedAt?: string | null; publishedAt?: string | null; instructions?: string; mode?: 'practice' | 'exam'; durationMinutes?: number; manualQuestionCount?: number; markedQuestionCount?: number; questions: AssessmentAttemptQuestion[] }
export type AssessmentResult = { attemptId: string; assessmentId: string; title: string; mode: string; autoScore: number; teacherScore: number; maximumScore: number; score: number; percentage: number; publishedAt: string }

export class AssessmentApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = 'AssessmentApiError' }
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try { response = await fetch(path, { method, credentials: 'include', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) }
  catch { throw new AssessmentApiError('The backend could not be reached. Start or restart it with npm run dev:api.', 0, 'API_UNAVAILABLE') }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; message?: string }
  if (!response.ok) throw new AssessmentApiError(payload.error?.message || payload.message || 'The request could not be completed.', response.status, payload.error?.code || 'REQUEST_FAILED')
  return payload as T
}

export const assessmentApi = {
  teacherAssessments: () => request<{ assessments: TeacherAssessment[] }>('/api/teacher/assessments'),
  createAssessment: (input: { title: string; instructions: string; mode: 'practice' | 'exam'; durationMinutes: number; questions: AssessmentQuestionInput[] }) => request<{ assessment: TeacherAssessment }>('/api/teacher/assessments', 'POST', input),
  publishAssessment: (id: string) => request<{ assessment: TeacherAssessment; message: string }>(`/api/teacher/assessments/${encodeURIComponent(id)}/publish`, 'POST', {}),
  closeAssessment: (id: string) => request<{ assessment: TeacherAssessment }>(`/api/teacher/assessments/${encodeURIComponent(id)}/close`, 'POST', {}),
  markingQueue: () => request<{ attempts: AssessmentAttempt[] }>('/api/teacher/marking-queue'),
  teacherAttempt: (id: string) => request<{ attempt: AssessmentAttempt }>(`/api/teacher/attempts/${encodeURIComponent(id)}`),
  markResponse: (attemptId: string, questionId: string, awardedMarks: number, feedback: string) => request<{ questionMark: { questionId: string; awardedMarks: number; feedback: string } }>(`/api/teacher/attempts/${encodeURIComponent(attemptId)}/marks`, 'PUT', { questionId, awardedMarks, feedback }),
  publishResult: (attemptId: string) => request<{ result: AssessmentResult; message: string }>(`/api/teacher/attempts/${encodeURIComponent(attemptId)}/publish`, 'POST', {}),
  learnerAssessments: () => request<{ assessments: LearnerAssessment[] }>('/api/learner/assessments'),
  lookupAssessment: (code: string) => request<{ assessment: LearnerAssessment }>(`/api/learner/assessments/lookup?code=${encodeURIComponent(code)}`),
  startAttempt: (joinCode: string) => request<{ assessment: LearnerAssessment & { id: string }; attempt: { id: string; status: string; startedAt: string }; questions: AssessmentAttemptQuestion[] }>(`/api/learner/assessments/${encodeURIComponent(joinCode)}/attempts`, 'POST', {}),
  saveAnswers: (attemptId: string, answers: Record<string, unknown>) => request<{ savedAt: string; answerCount: number }>(`/api/learner/attempts/${encodeURIComponent(attemptId)}/answers`, 'PUT', { answers }),
  submitAttempt: (attemptId: string) => request<{ result: { attemptId: string; status: string; autoScore: number; maximumScore: number; manualQuestionCount: number }; message: string }>(`/api/learner/attempts/${encodeURIComponent(attemptId)}/submit`, 'POST', {}),
  learnerAttempt: (attemptId: string) => request<{ attempt: AssessmentAttempt }>(`/api/learner/attempts/${encodeURIComponent(attemptId)}`),
  learnerResults: () => request<{ results: AssessmentResult[] }>('/api/learner/results'),
  parentLearners: () => request<{ learners: Array<{ id: string; fullName: string }> }>('/api/parent/learners'),
  parentResults: (learnerId: string) => request<{ results: AssessmentResult[] }>(`/api/parent/learners/${encodeURIComponent(learnerId)}/results`),
}
