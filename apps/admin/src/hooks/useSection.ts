import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Section } from '@/hooks/useSections'

export interface SettingUpdate {
  field_key: string
  field_value: string | null
  value_type: 'STRING' | 'INTEGER' | 'BOOLEAN' | 'JSON' | 'URL' | 'RICH_TEXT'
}

export interface SectionUpdatePayload {
  label?: string
  is_active?: boolean
  settings?: SettingUpdate[]
}

const sectionQueryKey = (id: string) => ['section', id] as const

export function useSection(sectionId: string | undefined) {
  return useQuery({
    queryKey: sectionId ? sectionQueryKey(sectionId) : ['section', 'none'],
    enabled: Boolean(sectionId),
    queryFn: async (): Promise<Section> => {
      const { data } = await api.get(`/v1/sections/${sectionId}`)
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useUpdateSection(sectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SectionUpdatePayload): Promise<Section> => {
      const { data } = await api.patch(`/v1/sections/${sectionId}`, payload)
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(sectionQueryKey(sectionId), updated)
      queryClient.invalidateQueries({ queryKey: ['sections'] })
    },
  })
}

export interface SectionPreview {
  token: string
  /** 섹션이 있는 페이지 — 홈페이지 미리보기가 그 페이지를 연다 */
  page_key: string
  expires_in: number
}

/** 저장 전 미리보기 (T-206) — 설정을 서버에 10분 보관하고 토큰을 받는다 */
export function usePreviewSection(sectionId: string) {
  return useMutation({
    mutationFn: async (settings: SettingUpdate[]): Promise<SectionPreview> => {
      const { data } = await api.post(`/v1/sections/${sectionId}/preview`, { settings })
      return data.data
    },
  })
}
