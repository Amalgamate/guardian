export type InboxMessage = {
  id: string
  subject: string
  body: string
  category: 'general' | 'support' | 'orders' | 'marketplace' | 'system'
  isAnnouncement: boolean
  createdAt: string
  readAt: string | null
  senderId: string | null
  senderName: string | null
}
export type InboxRecipient = { id: string; fullName: string; email: string | null; phone: string | null; roles: string[] }

export class InboxApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = 'InboxApiError' }
}

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { method, credentials: 'include', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new InboxApiError('The backend could not be reached. Start or restart the API with npm run dev:api.', 0, 'API_UNAVAILABLE')
  }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; message?: string }
  if (!response.ok) throw new InboxApiError(payload.error?.message || payload.message || 'The request could not be completed.', response.status, payload.error?.code || 'REQUEST_FAILED')
  return payload as T
}

export const inboxApi = {
  list: (options: { unread?: boolean; before?: string; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (options.unread) query.set('unread', 'true')
    if (options.before) query.set('before', options.before)
    if (options.limit) query.set('limit', String(options.limit))
    return request<{ messages: InboxMessage[]; hasMore: boolean; nextBefore: string | null }>(`/api/inbox${query.size ? `?${query.toString()}` : ''}`)
  },
  sent: (limit = 50) => request<{ messages: Array<InboxMessage & { recipientCount: number; recipientNames: string | null }> }>(`/api/inbox/sent?limit=${limit}`),
  detail: (id: string) => request<{ message: InboxMessage }>(`/api/inbox/${encodeURIComponent(id)}`),
  unreadCount: () => request<{ unreadCount: number }>('/api/inbox/unread-count'),
  markRead: (id: string) => request<{ message: { messageId: string; readAt: string } }>(`/api/inbox/${encodeURIComponent(id)}/read`, 'PATCH', {}),
  archive: (id: string) => request<{ message: { messageId: string; archivedAt: string } }>(`/api/inbox/${encodeURIComponent(id)}/archive`, 'PATCH', {}),
  sendSupport: (subject: string, body: string) => request<{ messageText: string }>('/api/inbox/support', 'POST', { subject, body }),
  sendDirect: (recipientUserId: string, subject: string, body: string, category: string) => request<{ message: InboxMessage }>('/api/inbox/messages', 'POST', { recipientUserId, subject, body, category }),
  announce: (subject: string, body: string, audience: 'all' | 'role', role?: string, institutionId?: string) => request<{ announcement: { id: string; recipientCount: number }; } & Record<string, unknown>>('/api/admin/inbox/announcements', 'POST', { subject, body, audience, role, institutionId }),
  users: () => request<{ users: InboxRecipient[] }>('/api/admin/users'),
}
