import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type InquiryStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SPAM'
export type InquiryType = 'GENERAL' | 'CONSULT' | 'RESERVATION' | 'PARTNERSHIP'

export interface InquiryListItem {
  id: string
  inquiry_type: string
  name: string
  phone: string
  email: string | null
  status: InquiryStatus
  is_read: boolean
  admin_memo: string | null
  /** 상담 게시판 · 예약 (T-123) */
  subject?: string | null
  is_board?: boolean
  answered_at?: string | null
  reserved_date?: string | null
  reserved_time?: string | null
  created_at: string
  /** 방문자 회원 문의 (T-115) — 비회원은 null */
  member_id?: string | null
}

export type MemberReservationStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'

export interface InquiryMemberInfo {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  is_active: boolean
}

export interface InquiryReservationInfo {
  id: string
  reservation_type: 'MEDICAL' | 'LODGING' | 'GENERAL'
  status: MemberReservationStatus
  reserved_at: string | null
  detail: Record<string, unknown>
  /** 관리자가 바꿀 수 있는 다음 상태 */
  next_statuses: MemberReservationStatus[]
}

export interface InquiryListResponse {
  total: number
  page: number
  limit: number
  items: InquiryListItem[]
}

export interface InquiryDetail extends InquiryListItem {
  tenant_id: string
  message: string
  is_secret?: boolean
  /** 상담 게시판에 공개되는 답변 */
  answer?: string | null
  attachments: Array<{
    id: string
    file_url: string
    file_name: string
    file_size: number
  }>
  updated_at: string
  /** 회원 정보 · 회원 예약 (T-115) */
  member?: InquiryMemberInfo | null
  reservation?: InquiryReservationInfo | null
}

export interface InquiryFilters {
  page?: number
  limit?: number
  status?: InquiryStatus | ''
  inquiry_type?: InquiryType | ''
  is_read?: boolean
  search?: string
}

export interface InquiryUpdate {
  status?: InquiryStatus
  is_read?: boolean
  admin_memo?: string | null
  /** 상담 게시판 답변 — 빈 문자열이면 답변 삭제 */
  answer?: string
}

const cleanParams = (filters: InquiryFilters) => {
  const out: Record<string, string | number | boolean> = {}
  if (filters.page) out.page = filters.page
  if (filters.limit) out.limit = filters.limit
  if (filters.status) out.status = filters.status
  if (filters.inquiry_type) out.inquiry_type = filters.inquiry_type
  if (typeof filters.is_read === 'boolean') out.is_read = filters.is_read
  if (filters.search) out.search = filters.search
  return out
}

export function useInquiries(filters: InquiryFilters) {
  return useQuery({
    queryKey: ['inquiries', filters],
    queryFn: async (): Promise<InquiryListResponse> => {
      const { data } = await api.get('/v1/inquiries', {
        params: cleanParams(filters),
      })
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useInquiry(inquiryId: string | null | undefined) {
  return useQuery({
    queryKey: ['inquiry', inquiryId],
    enabled: Boolean(inquiryId),
    queryFn: async (): Promise<InquiryDetail> => {
      const { data } = await api.get(`/v1/inquiries/${inquiryId}`)
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useUpdateInquiry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string
      payload: InquiryUpdate
    }): Promise<InquiryDetail> => {
      const { data } = await api.patch(`/v1/inquiries/${id}`, payload)
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['inquiry', updated.id], updated)
      queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'recent'] })
    },
  })
}

/** 회원 예약 상태 변경 — 확정 · 완료 · 취소 (회원에게 알림, T-115) */
export function useUpdateMemberReservation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: Exclude<MemberReservationStatus, 'PENDING'>
    }): Promise<InquiryDetail> => {
      const { data } = await api.patch(`/v1/inquiries/${id}/reservation`, { status })
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['inquiry', updated.id], updated)
      queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
    },
  })
}

export function useDeleteInquiry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/inquiries/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'recent'] })
    },
  })
}

export async function downloadInquiriesExcel() {
  const resp = await api.get('/v1/inquiries/export', { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([resp.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute(
    'download',
    `inquiries-${new Date().toISOString().slice(0, 10)}.xlsx`
  )
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
