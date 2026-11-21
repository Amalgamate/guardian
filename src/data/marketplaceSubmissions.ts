export type MarketplaceSubmissionStatus = 'Draft' | 'Pending review' | 'Approved' | 'Rejected'

export type MarketplaceSubmission = {
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
  price: number
  vendor: string
  fileName: string
  rightsConfirmed: boolean
  status: MarketplaceSubmissionStatus
  reviewNote: string
  submittedAt: string
}

const storageKey = 'examify-marketplace-submissions'

export function readMarketplaceSubmissions(): MarketplaceSubmission[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]') as MarketplaceSubmission[]
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function saveMarketplaceSubmissions(items: MarketplaceSubmission[]) {
  localStorage.setItem(storageKey, JSON.stringify(items))
}

export function publishedMarketplaceSubmissions() {
  return readMarketplaceSubmissions().filter((item) => item.status === 'Approved')
}
