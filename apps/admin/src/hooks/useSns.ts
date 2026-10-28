import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 카카오톡 플로팅 버튼 위치 */
export type FloatingPosition = 'BOTTOM_RIGHT' | 'BOTTOM_LEFT'

export interface SnsSettings {
  id: string
  tenant_id: string
  kakao_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  youtube_url: string | null
  blog_url: string | null
  naver_url: string | null
  /** 노출 위치 (T-038-A, 기획서 AD-03) */
  show_in_footer: boolean
  show_floating: boolean
  floating_position: FloatingPosition
  updated_at: string
}

export interface SnsSettingsUpdate {
  kakao_url?: string | null
  instagram_url?: string | null
  facebook_url?: string | null
  youtube_url?: string | null
  blog_url?: string | null
  naver_url?: string | null
  show_in_footer?: boolean
  show_floating?: boolean
  floating_position?: FloatingPosition
}

const SNS_KEY = ['sns-settings'] as const

export function useSnsSettings() {
  return useQuery({
    queryKey: SNS_KEY,
    queryFn: async (): Promise<SnsSettings | null> => {
      const { data } = await api.get('/v1/sns-settings')
      return data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useUpdateSns() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SnsSettingsUpdate): Promise<SnsSettings> => {
      const { data } = await api.put('/v1/sns-settings', payload)
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(SNS_KEY, updated)
    },
  })
}

export function useTestSnsUrl() {
  return useMutation({
    mutationFn: async (url: string): Promise<boolean> => {
      const { data } = await api.post('/v1/sns-settings/test-url', { url })
      return data.data.is_valid
    },
  })
}
