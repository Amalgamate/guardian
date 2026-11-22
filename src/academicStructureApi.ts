export type AcademicRecord = {
  id: string
  code?: string | null
  name: string
  description?: string | null
  status: 'active' | 'archived'
  curriculumId?: string
  curriculumName?: string
  levelId?: string
  levelName?: string
  sortOrder?: number
}

export type AcademicStructure = {
  curricula: AcademicRecord[]
  levels: AcademicRecord[]
  grades: AcademicRecord[]
  subjects: AcademicRecord[]
  terms: AcademicRecord[]
  gradeSubjects: Array<{ gradeId: string; subjectId: string }>
}

export type AcademicKind = keyof Pick<AcademicStructure, 'curricula' | 'levels' | 'grades' | 'subjects' | 'terms'>
type ApiPayload<T> = T & { error?: { message?: string } }

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>
  if (!response.ok) throw new Error(payload.error?.message || 'The academic structure request failed.')
  return payload
}

export const academicStructureApi = {
  get: () => request<AcademicStructure>('/api/admin/academic-structure'),
  create: (kind: AcademicKind, input: Record<string, string | number | null>) => request<{ record: AcademicRecord }>(`/api/admin/academic-structure/${kind}`, 'POST', input),
  update: (kind: AcademicKind, id: string, input: Record<string, string | number | null>) => request<{ record: AcademicRecord }>(`/api/admin/academic-structure/${kind}/${id}`, 'PATCH', input),
  archive: (kind: AcademicKind, id: string) => request<{ record: AcademicRecord }>(`/api/admin/academic-structure/${kind}/${id}`, 'DELETE'),
}
