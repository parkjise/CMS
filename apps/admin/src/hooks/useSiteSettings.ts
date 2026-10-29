import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정) */
export interface SiteSettings {
  id: string
  tenant_id: string
  phone: string | null
  email: string | null
  address: string | null
  address_detail: string | null
  hours_weekday: string | null
  hours_saturday: string | null
  hours_note: string | null
  parking: string | null
  ceo: string | null
  business_number: string | null
  logo_url: string | null
  favicon_url: string | null
  updated_at: string
}

export type SiteSettingsField = Exclude<keyof SiteSettings, 'id' | 'tenant_id' | 'updated_at'>

/** 보내지 않은 칸은 그대로, "" 는 지우기 */
export type SiteSettingsUpdate = Partial<Record<SiteSettingsField, string>>

const SITE_KEY = ['site-settings'] as const

export function useSiteSettings() {
  return useQuery({
    queryKey: SITE_KEY,
    queryFn: async (): Promise<SiteSettings | null> => {
      const { data } = await api.get('/v1/site-settings')
      return data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useUpdateSiteSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SiteSettingsUpdate): Promise<SiteSettings> => {
      const { data } = await api.put('/v1/site-settings', payload)
      return data.data
    },
    onSuccess: (saved) => queryClient.setQueryData(SITE_KEY, saved),
  })
}
