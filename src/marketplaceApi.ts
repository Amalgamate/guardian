export type SubmissionStatus = 'draft' | 'submitted' | 'changes_requested' | 'approved' | 'rejected'
export type MarketplaceSubmissionRecord = {
  id: string
  title: string
  description: string
  curriculum: string
  level: string
  grade: string
  subject: string
  year: string
  term: string
  type: string
  resource: string
  pages: number
  questions: number
  formats: string[]
  price: number | string
  vendor?: string
  institutionName?: string
  fileName: string | null
  rightsConfirmed: boolean
  status: SubmissionStatus
  reviewNote: string | null
  submittedAt: string | null
  createdAt?: string
  updatedAt?: string
}
export type SubmissionInput = Omit<MarketplaceSubmissionRecord, 'id' | 'status' | 'reviewNote' | 'submittedAt' | 'createdAt' | 'updatedAt' | 'vendor' | 'institutionName'>
export type WalletBalances = { pending: number; available: number; reserved: number; paid: number }
export type SellerSettlement = { id: string; title: string; amountKes: number | string; status: 'pending' | 'settled'; teacherName?: string; institutionName?: string; createdAt: string; settledAt?: string | null }
export type TeacherPayout = { id: string; teacherName?: string; teacherEmail?: string | null; teacherUserId?: string; amountKes: number | string; destinationPhone: string; status: 'pending' | 'approved' | 'rejected' | 'paid'; reviewNote?: string | null; requestNote?: string | null; requestedAt: string; reviewedAt?: string | null; paidAt?: string | null }
export type CatalogProduct = { id: string; title: string; description: string; curriculum: string; level: string; grade: string; subject: string; academicYear: string; term: string; assessmentType: string; resource: string; pageCount: number; questionCount: number; formats: string[]; priceKes: number | string; institutionName: string; vendorName: string; publishedAt: string }

export class MarketplaceApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = 'MarketplaceApiError' }
}

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new MarketplaceApiError('The backend could not be reached. Start or restart the API with npm run dev:api.', 0, 'API_UNAVAILABLE')
  }
  const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; message?: string }
  if (!response.ok) throw new MarketplaceApiError(payload.error?.message || payload.message || 'The request could not be completed.', response.status, payload.error?.code || 'REQUEST_FAILED')
  return payload as T
}

export const marketplaceApi = {
  paymentOptions: () => request<{ mpesa: { enabled: boolean; environment: 'sandbox' | 'production' | null } }>('/api/marketplace/payment-options'),
  catalog: (filters: { q?: string; curriculum?: string; level?: string; grade?: string; subject?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as Array<[string, string]>)
    return request<{ products: CatalogProduct[] }>(`/api/marketplace/catalog${query.size ? `?${query.toString()}` : ''}`)
  },
  createOrder: (productIds: string[]) => request<{ order: { id: string; status: string; totalKes: number; currency: 'KES'; isSimulatedPayment: boolean; items: Array<{ productId: string; title: string; priceKes: number }> } }>('/api/marketplace/orders', 'POST', { productIds }),
  startMpesaStk: (orderId: string, phone: string) => request<{ order: { id: string; status: string; totalKes: number; isSimulatedPayment: boolean }; message: string }>(`/api/marketplace/orders/${encodeURIComponent(orderId)}/mpesa/stk`, 'POST', { phone }),
  getOrder: (orderId: string) => request<{ order: { id: string; status: string; totalKes: number; paymentReference: string | null; paymentError: string | null; isSimulatedPayment: boolean } }>(`/api/marketplace/orders/${encodeURIComponent(orderId)}`),
  simulatePayment: (orderId: string) => request<{ order: { id: string; status: string; totalKes: number; isSimulatedPayment: boolean }; message: string }>(`/api/marketplace/orders/${encodeURIComponent(orderId)}/simulate-payment`, 'POST', {}),
  teacherSubmissions: () => request<{ submissions: MarketplaceSubmissionRecord[] }>('/api/teacher/marketplace-submissions'),
  adminSubmissions: (status = 'submitted') => request<{ submissions: MarketplaceSubmissionRecord[] }>(`/api/admin/marketplace-submissions?status=${encodeURIComponent(status)}`),
  createSubmission: (input: SubmissionInput) => request<{ submission: { id: string; status: SubmissionStatus } }>('/api/teacher/marketplace-submissions', 'POST', input),
  updateSubmission: (id: string, input: SubmissionInput) => request<{ submission: { id: string; status: SubmissionStatus } }>(`/api/teacher/marketplace-submissions/${encodeURIComponent(id)}`, 'PATCH', input),
  submitSubmission: (id: string) => request<{ submission: { id: string; status: SubmissionStatus } }>(`/api/teacher/marketplace-submissions/${encodeURIComponent(id)}/submit`, 'POST', {}),
  reviewSubmission: (id: string, status: 'approved' | 'changes_requested' | 'rejected', reviewNote: string) => request<{ submission: MarketplaceSubmissionRecord }>(`/api/admin/marketplace-submissions/${encodeURIComponent(id)}/review`, 'PATCH', { status, reviewNote }),
  teacherWallet: () => request<{ currency: 'KES'; balances: WalletBalances; payouts: TeacherPayout[]; settlements: SellerSettlement[]; sharePercent: number; simulatedOnly: boolean }>('/api/teacher/wallet'),
  requestPayout: (amountKes: number, phone: string, note?: string) => request<{ payout: TeacherPayout; message: string }>('/api/teacher/wallet/payouts', 'POST', { amountKes, phone, note }),
  adminSettlements: (status = 'pending') => request<{ settlements: SellerSettlement[] }>(`/api/admin/marketplace-settlements?status=${encodeURIComponent(status)}`),
  approveSettlement: (id: string) => request<{ settlement: SellerSettlement; message: string }>(`/api/admin/marketplace-settlements/${encodeURIComponent(id)}/approve`, 'POST', {}),
  adminPayouts: (status = 'pending') => request<{ payouts: TeacherPayout[] }>(`/api/admin/teacher-payouts?status=${encodeURIComponent(status)}`),
  reviewPayout: (id: string, status: 'approved' | 'rejected', reviewNote: string) => request<{ payout: TeacherPayout; message: string }>(`/api/admin/teacher-payouts/${encodeURIComponent(id)}/review`, 'PATCH', { status, reviewNote }),
  markPayoutPaid: (id: string) => request<{ payout: TeacherPayout; message: string }>(`/api/admin/teacher-payouts/${encodeURIComponent(id)}/mark-paid`, 'POST', {}),
}
