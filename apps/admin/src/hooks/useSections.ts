import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SectionSetting {
  id: string
  field_key: string
  field_value: string | null
  value_type: string
}

export interface Section {
  id: string
  tenant_id: string
  section_type: string
  label: string
  display_order: number
  is_active: boolean
  settings: SectionSetting[]
  created_at: string
  updated_at: string
}

const SECTIONS_QUERY_KEY = ['sections'] as const

export function useSections() {
  return useQuery({
    queryKey: SECTIONS_QUERY_KEY,
    queryFn: async (): Promise<Section[]> => {
      const { data } = await api.get('/v1/sections')
      return data.data
    },
    staleTime: 60 * 1000,
  })
}

/**
 * 섹션 순서 일괄 변경. 낙관적 업데이트: 호출 즉시 캐시 갱신 → 실패 시 롤백.
 */
export function useReorderSections() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await api.patch('/v1/sections/order', {
        sections: orderedIds.map((id, idx) => ({
          id,
          display_order: idx,
        })),
      })
    },
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: SECTIONS_QUERY_KEY })
      const previous = queryClient.getQueryData<Section[]>(SECTIONS_QUERY_KEY)

      if (previous) {
        const map = new Map(previous.map((s) => [s.id, s]))
        const reordered = orderedIds
          .map((id, idx) => {
            const s = map.get(id)
            return s ? { ...s, display_order: idx } : null
          })
          .filter((s): s is Section => s !== null)
        queryClient.setQueryData<Section[]>(SECTIONS_QUERY_KEY, reordered)
      }

      return { previous }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(SECTIONS_QUERY_KEY, ctx.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY })
    },
  })
}

/**
 * 섹션 활성화 토글. 백엔드가 현재 값을 반전시키므로 요청은 sectionId만 보냄.
 */
export function useToggleSection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sectionId: string) => {
      const { data } = await api.patch(`/v1/sections/${sectionId}/toggle`)
      return data.data as Section
    },
    onMutate: async (sectionId) => {
      await queryClient.cancelQueries({ queryKey: SECTIONS_QUERY_KEY })
      const previous = queryClient.getQueryData<Section[]>(SECTIONS_QUERY_KEY)
      if (previous) {
        queryClient.setQueryData<Section[]>(
          SECTIONS_QUERY_KEY,
          previous.map((s) =>
            s.id === sectionId ? { ...s, is_active: !s.is_active } : s
          )
        )
      }
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(SECTIONS_QUERY_KEY, ctx.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY })
    },
  })
}
