import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface NotificationSettings {
  id: string
  tenant_id: string
  alimtalk_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
  recipient_phone: string | null
  /** 알림 받을 번호 문자 인증 시각 (T-204) — 없으면 '인증 필요' */
  recipient_phone_verified_at?: string | null
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
  /** 번호를 바꾸거나 인증할 때 — 인증 완료한 id (T-204) */
  phone_verification_id?: string
}

export interface PhoneCodeSent {
  verification_id: string
  expires_at: string
  resend_after_seconds: number
  /** 개발(test 모드) 전용 — 운영에서는 항상 null */
  debug_code?: string | null
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

/** 알림 받을 번호로 인증번호 문자 (T-204) */
export function useSendAlertPhoneCode() {
  return useMutation({
    mutationFn: async (phone: string): Promise<PhoneCodeSent> => {
      const { data } = await api.post('/v1/notification-settings/phone/send-code', {
        phone,
      })
      return data.data
    },
  })
}

export function useVerifyAlertPhoneCode() {
  return useMutation({
    mutationFn: async (payload: {
      verification_id: string
      code: string
    }): Promise<{ verification_id: string; verified: boolean }> => {
      const { data } = await api.post('/v1/notification-settings/phone/verify', payload)
      return data.data
    },
  })
}
