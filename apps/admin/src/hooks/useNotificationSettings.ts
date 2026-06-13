import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface NotificationSettings {
  id: string
  tenant_id: string
  alimtalk_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
  recipient_phone: string | null
  recipient_email: string | null
  monthly_kakao_count: number
  updated_at: string
}

export interface NotificationSettingsUpdate {
  alimtalk_enabled?: boolean
  sms_enabled?: boolean
  email_enabled?: boolean
  recipient_phone?: string | null
  recipient_email?: string | null
}

export interface TestNotificationResult {
  sent: boolean
  channels: string[]
  message: string
}

const NOTIF_KEY = ['notification-settings'] as const

export function useNotificationSettings() {
  return useQuery({
    queryKey: NOTIF_KEY,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data } = await api.get('/v1/notification-settings')
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      payload: NotificationSettingsUpdate
    ): Promise<NotificationSettings> => {
      const { data } = await api.put('/v1/notification-settings', payload)
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(NOTIF_KEY, updated)
    },
  })
}

export function useTestNotification() {
  return useMutation({
    mutationFn: async (): Promise<TestNotificationResult> => {
      const { data } = await api.post('/v1/notification-settings/test')
      return data.data
    },
  })
}
