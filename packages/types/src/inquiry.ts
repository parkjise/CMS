export type InquiryType = 'CONSULT' | 'RESERVATION' | 'PARTNERSHIP' | 'GENERAL'

export type InquiryStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SPAM'

export interface Inquiry {
  id: string
  tenant_id: string
  type: InquiryType
  status: InquiryStatus
  name: string
  phone: string
  email: string | null
  message: string
  admin_memo: string | null
  is_notified: boolean
  created_at: string
  updated_at: string
}

export interface InquiryCreate {
  type?: InquiryType
  name: string
  phone: string
  email?: string
  message: string
}

export interface InquiryStatusUpdate {
  status: InquiryStatus
  admin_memo?: string
}

export interface InquiryListParams {
  status?: InquiryStatus | 'all'
  type?: InquiryType | 'all'
  page?: number
  size?: number
}
