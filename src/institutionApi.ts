export type InstitutionApplicationInput = {
  institutionName: string
  institutionType: 'school' | 'college' | 'other'
  registrationNumber: string
  county: string
  town: string
  physicalAddress?: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  notes?: string
}

type ApplicationResponse = { application?: { id: string; status: string; createdAt: string }; message?: string; error?: { message?: string } }

export async function submitInstitutionApplication(input: InstitutionApplicationInput) {
  const response = await fetch('/api/institution-applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const payload = await response.json().catch(() => ({})) as ApplicationResponse
  if (!response.ok) throw new Error(payload.error?.message || 'Could not submit the school access request.')
  return payload
}
