import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MenuNode, PublicFieldGroup, SiteInfoFields, SiteMenu, WeeklyHours } from '@cms/types'
import { api } from '@/lib/api'

/** 사업체 공통 정보 (T-036-A, 기획서 AD-02-A 공통 설정 · T-222 기본정보 확장) */
export interface SiteSettings extends SiteInfoFields {
  id: string
  tenant_id: string
  /** 숨긴 공개 항목 묶음 — 비어 있으면 모두 공개 */
  hidden_fields: PublicFieldGroup[]
  updated_at: string
}

export type SiteSettingsField = Exclude<keyof SiteInfoFields, 'weekly_hours'>

/** 보내지 않은 칸은 그대로, "" · {} · [] 는 지우기 */
export type SiteSettingsUpdate = Partial<Record<SiteSettingsField, string>> & {
  weekly_hours?: WeeklyHours
  hidden_fields?: PublicFieldGroup[]
}

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

// ── 상단 메뉴 (T-036-B · T-223 트리) ───────────────────────────────────

export type { SiteMenu } from '@cms/types'

export const MENU_KEY = ['site-settings', 'menu'] as const

export function useSiteMenu() {
  return useQuery({
    queryKey: MENU_KEY,
    queryFn: async (): Promise<SiteMenu> => {
      const { data } = await api.get('/v1/site-settings/menu')
      return data.data
    },
  })
}

/** 지금 템플릿의 메뉴 트리를 통째로 저장한다 (T-223) */
export function useUpdateSiteMenu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (nodes: MenuNode[]): Promise<SiteMenu> => {
      const { data } = await api.put('/v1/site-settings/menu', { nodes })
      return data.data
    },
    onSuccess: (saved) => queryClient.setQueryData(MENU_KEY, saved),
  })
}

/** 지금 템플릿의 기본 메뉴로 되돌린다 — 저장한 트리를 지운다 */
export function useResetSiteMenu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SiteMenu> => {
      const { data } = await api.delete('/v1/site-settings/menu')
      return data.data
    },
    onSuccess: (saved) => queryClient.setQueryData(MENU_KEY, saved),
  })
}
