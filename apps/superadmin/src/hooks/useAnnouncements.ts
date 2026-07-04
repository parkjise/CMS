import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export type AnnouncementType =
  | 'INFO'
  | 'WARNING'
  | 'FEATURE_UPDATE'
  | 'MAINTENANCE'
  | 'URGENT'

export interface Announcement {
  id: string
  title: string
  content: string
  type: AnnouncementType
  target_type: string
  target_plan: string | null
  target_tenants: string[] | null
  is_published: boolean
  show_in_admin: boolean
  send_email: boolean
  send_kakao: boolean
  published_at: string | null
  expires_at: string | null
  created_at: string
  read_count: number
}

export function useAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ['super', 'announcements'],
    queryFn: async () => {
      const { data } = await superApi.get('/v1/announcements')
      return data.data.items as Announcement[]
    },
  })
}

export interface AnnouncementInput {
  title: string
  content: string
  type: AnnouncementType
  target_type: 'ALL' | 'PLAN_BASED' | 'SELECTIVE'
  target_plan?: string
  target_tenants?: string[]
  show_in_admin: boolean
  send_kakao: boolean
  send_email: boolean
  publish_now: boolean
  expires_at?: string | null
}

export function useCreateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AnnouncementInput) => {
      const { data } = await superApi.post('/v1/announcements', input)
      return data.data as Announcement
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['super', 'announcements'] }),
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await superApi.delete(`/v1/announcements/${id}`)
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['super', 'announcements'] }),
  })
}

export function useSendAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await superApi.post(`/v1/announcements/${id}/send`)
      return data.data as { target_count: number }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['super', 'announcements'] }),
  })
}
