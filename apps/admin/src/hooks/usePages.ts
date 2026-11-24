import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 페이지 (T-237 · T-238, 페이지 관리 기획서 PM-01 · PM-02) */
export interface Page {
  id: string
  page_key: string
  title: string
  /** 템플릿 기본 페이지 · 직접 만든 페이지 */
  origin: 'TEMPLATE' | 'CUSTOM'
  parent_key: string | null
  show_in_menu: boolean
  is_public: boolean
  display_order: number
  seo_title: string | null
  seo_description: string | null
  og_image_url: string | null
  noindex: boolean
  section_count: number
  updated_at: string
  deleted_at: string | null
}

export interface PageLimits {
  plan: string
  /** null = 제한 없음 */
  limit: number | null
  used: number
  can_create: boolean
  reason: string | null
}

export interface PageList {
  /** CUSTOM_PAGES 스위치 — 꺼져 있으면 목록만 */
  enabled: boolean
  pages: Page[]
  trash: Page[]
  limits: PageLimits
}

export interface PageInput {
  title?: string
  page_key?: string
  /** "" = 맨 위로 */
  parent_key?: string
  show_in_menu?: boolean
  is_public?: boolean
  /** "" = 지우기 */
  seo_title?: string
  seo_description?: string
  noindex?: boolean
}

export const HOME_PAGE = 'home'
export const PAGES_KEY = ['pages'] as const

export function usePages() {
  return useQuery({
    queryKey: PAGES_KEY,
    queryFn: async (): Promise<PageList> => {
      const { data } = await api.get('/v1/pages')
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

/** 주소 미리 확인 — 형식이 맞을 때만 서버에 묻는다 (쓸 수 없는 주소 · 사용 중) */
export function usePageKeyCheck(key: string) {
  return useQuery({
    queryKey: [...PAGES_KEY, 'check-key', key],
    enabled: key.length >= 2,
    queryFn: async (): Promise<{ available: boolean; reason: string | null }> => {
      const { data } = await api.get('/v1/pages/check-key', { params: { key } })
      return data.data
    },
    staleTime: 10 * 1000,
    meta: { suppressGlobalError: true },
  })
}

/** 페이지가 바뀌면 섹션(주소 · 삭제) · 메뉴 후보도 함께 다시 읽는다 */
function useInvalidatePages() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PAGES_KEY }),
      queryClient.invalidateQueries({ queryKey: ['sections'] }),
      queryClient.invalidateQueries({ queryKey: ['site-settings'] }),
    ])
}

export function useCreatePage() {
  const invalidate = useInvalidatePages()
  return useMutation({
    mutationFn: async (input: PageInput): Promise<Page> => {
      const { data } = await api.post('/v1/pages', input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDuplicatePage() {
  const invalidate = useInvalidatePages()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string
      title: string
      page_key: string
    }): Promise<Page> => {
      const { data } = await api.post(`/v1/pages/${id}/duplicate`, input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdatePage() {
  const invalidate = useInvalidatePages()
  return useMutation({
    mutationFn: async ({ id, ...input }: PageInput & { id: string }): Promise<Page> => {
      const { data } = await api.patch(`/v1/pages/${id}`, input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

/** 순서 — 낙관적으로 바로 바꾸고 실패하면 되돌린다 */
export function useReorderPages() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await api.patch('/v1/pages/order', { ids })
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: PAGES_KEY })
      const previous = queryClient.getQueryData<PageList>(PAGES_KEY)
      if (previous) {
        const byId = new Map(previous.pages.map((p) => [p.id, p]))
        const pages = ids
          .map((id, order) => {
            const page = byId.get(id)
            return page ? { ...page, display_order: order } : null
          })
          .filter((p): p is Page => p !== null)
        queryClient.setQueryData<PageList>(PAGES_KEY, { ...previous, pages })
      }
      return { previous }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(PAGES_KEY, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PAGES_KEY }),
  })
}

export function useDeletePage() {
  const invalidate = useInvalidatePages()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/pages/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useRestorePage() {
  const invalidate = useInvalidatePages()
  return useMutation({
    mutationFn: async (id: string): Promise<Page> => {
      const { data } = await api.post(`/v1/pages/${id}/restore`)
      return data.data
    },
    onSuccess: invalidate,
  })
}
