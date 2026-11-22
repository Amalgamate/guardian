export type UserRole = 'Learner' | 'Parent' | 'Teacher' | 'School admin' | 'Platform admin' | 'Examiner'

export type RoleMembership = { role: UserRole; institutionId: string | null }
export type AuthUser = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  status: string
  emailVerified: boolean
  phoneVerified: boolean
  roles: RoleMembership[]
}
export type AuthSession = {
  user: AuthUser
  activeRole: UserRole
  institutionId?: string | null
  permissions?: string[]
  expiresAt?: string
}
export type OtpChallenge = { challengeId: string; channel: 'email' | 'sms'; maskedDestination: string; deliveryMode?: 'email' | 'sms' | 'console'; expiresInSeconds: number }

export class AuthApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly data: Record<string, unknown> = {}) { super(message); this.name = 'AuthApiError' }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AuthApiError('Authentication service is not reachable. Start the backend with npm run dev:api.', 'API_UNAVAILABLE', 0)
  }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; code?: string; message?: string; [key: string]: unknown }
  if (!response.ok) throw new AuthApiError(payload.error?.message || payload.message || 'The request could not be completed.', payload.error?.code || payload.code || 'REQUEST_FAILED', response.status, payload)
  return payload as T
}

export const authApi = {
  register: (input: { fullName: string; email?: string; phone?: string; password: string; role: UserRole; channel: 'email' | 'sms'; invitationToken?: string }) =>
    request<OtpChallenge & { message: string }>('/api/auth/register', 'POST', input),
  verify: (challengeId: string, code: string) => request<AuthSession>('/api/auth/verify', 'POST', { challengeId, code }),
  login: (identifier: string, password: string, role?: UserRole) => request<AuthSession>('/api/auth/login', 'POST', { identifier, password, role }),
  resend: (challengeId: string) => request<OtpChallenge & { message: string }>('/api/auth/resend', 'POST', { challengeId }),
  forgot: (identifier: string, channel: 'email' | 'sms') => request<{ challengeId: string; message: string; deliveryMode?: 'email' | 'sms' | 'console' }>('/api/auth/password/forgot', 'POST', { identifier, channel }),
  verifyReset: (challengeId: string, code: string) => request<{ resetToken: string }>('/api/auth/password/verify', 'POST', { challengeId, code }),
  reset: (resetToken: string, newPassword: string) => request<{ message: string }>('/api/auth/password/reset', 'POST', { resetToken, newPassword }),
  me: () => request<AuthSession>('/api/auth/me'),
  switchRole: (role: UserRole, institutionId: string | null) => request<{ activeRole: UserRole; institutionId: string | null; permissions: string[] }>('/api/auth/active-role', 'POST', { role, institutionId }),
  logout: () => request<{ message: string }>('/api/auth/logout', 'POST', {}),
}
