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
  created_at: string
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
  attachments: Array<{
    id: string
    file_url: string
    file_name: string
    file_size: number
  }>
  updated_at: string
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
