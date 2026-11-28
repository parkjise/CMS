import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SectionSetting {
  id: string
  field_key: string
  field_value: string | null
  value_type: string
  /** 템플릿 샘플 값 그대로인지 — 저장하면 false (기획서 11.8) */
  is_sample?: boolean
}

export interface Section {
  id: string
  tenant_id: string
  section_type: string
  label: string
  display_order: number
  is_active: boolean
  /** 섹션이 속한 페이지 (기본 home) */
  page_key?: string
  /** 공통 블록(참조형)으로 쓰는 섹션이면 그 블록 (T-260) */
  block_id?: string | null
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
        // 한 페이지의 섹션만 옮긴다 (T-238) — 다른 페이지 섹션은 그대로 두고 그 자리에 차례로
        const moved = new Set(orderedIds)
        const order = new Map(orderedIds.map((id, idx) => [id, idx]))
        const byId = new Map(previous.map((s) => [s.id, s]))
        let next = 0
        const reordered = previous.map((s) => {
          if (!moved.has(s.id)) return s
          const id = orderedIds[next++]
          const item = byId.get(id) ?? s
          return { ...item, display_order: order.get(id) ?? item.display_order }
        })
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
          previous.map((s) => (s.id === sectionId ? { ...s, is_active: !s.is_active } : s))
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

// ── 섹션 추가 · 삭제 + 요금제 한도 (기획서 AD-02 · 3.2, T-037-A) ──────────────

export interface SectionLimits {
  plan_type: string
  count: number
  /** null 이면 무제한 */
  limit: number | null
  can_add: boolean
  can_delete: boolean
  /** 추가 · 삭제를 못 하는 이유 (요금제 고정 · 한도 · 코드형 템플릿) */
  reason: string | null
  /** variant — 코드형 직접 페이지의 사진+글 배치 (T-241), 추가할 때 그대로 보낸다 */
  addable_types: Array<{ section_type: string; label: string; variant?: string | null }>
  /** 지울 수 있는 종류 — null 이면 모두. 코드형 기본 페이지는 연결 섹션만 (T-262) */
  deletable_types?: string[] | null
}

/** 요금제 판단은 서버가 한다 — 화면은 can_add · can_delete · reason 만 따른다. 페이지마다 (T-241) */
export function useSectionLimits(pageKey = 'home') {
  return useQuery({
    queryKey: ['sections', 'limits', pageKey],
    queryFn: async (): Promise<SectionLimits> => {
      const { data } = await api.get('/v1/sections/limits', { params: { page_key: pageKey } })
      return data.data
    },
    staleTime: 60 * 1000,
    // 스위치가 꺼진 직접 페이지는 404 — 추가 막대만 숨긴다
    meta: { suppressGlobalError: true },
    retry: false,
  })
}

export function useCreateSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      section_type: string
      label?: string
      /** 넣을 페이지 (T-241) — 없으면 홈 */
      page_key?: string
      variant?: string | null
    }) => {
      const { data } = await api.post('/v1/sections', body)
      return data.data as Section
    },
    onSettled: () => {
      // ['sections'] 접두로 목록 · 한도를 함께 새로 읽는다
      queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY })
    },
  })
}

export function useDeleteSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sectionId: string) => {
      await api.delete(`/v1/sections/${sectionId}`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY })
    },
  })
}
