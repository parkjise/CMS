import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BodyNode } from '@cms/types'
import { api } from '@/lib/api'
import { CONTENT_TYPES_KEY } from '@/hooks/useContentTypes'

/** 콘텐츠 항목 (T-254 · T-256, 콘텐츠 관리 기획서 CM-01 · 02) */
export type ContentStatus = 'DRAFT' | 'PUBLISHED'

export interface ContentTagRef {
  id: string
  name: string
}

export interface ContentItem {
  id: string
  type: { id: string; type_key: string; name: string }
  category_id: string | null
  category_name: string | null
  title: string
  summary: string
  body: BodyNode[]
  data: Record<string, unknown>
  thumbnail_url: string | null
  status: ContentStatus
  published_at: string | null
  display_order: number
  tags: ContentTagRef[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ContentItemCounts {
  all: number
  published: number
  draft: number
  trash: number
}

export interface ContentItemList {
  items: ContentItem[]
  total: number
  page: number
  size: number
  counts: ContentItemCounts
}

export interface ContentItemFilters {
  page: number
  size: number
  type_id?: string
  status?: ContentStatus
  category_id?: string
  tag_id?: string
  q?: string
  trash?: boolean
}

export interface ContentItemInput {
  type_id?: string
  title?: string
  summary?: string
  body?: BodyNode[]
  /** 보낸 칸만 바뀐다 — null 은 그 칸을 비운다 */
  data?: Record<string, unknown>
  thumbnail_url?: string | null
  category_id?: string | null
  /** 태그 이름 — 없는 이름은 서버가 만든다 */
  tags?: string[]
  status?: ContentStatus
}

export type ContentBulkAction = 'publish' | 'draft' | 'trash' | 'restore'

export interface ContentCategoryNode {
  id: string
  name: string
  parent_id: string | null
  display_order: number
  item_count: number
  children: ContentCategoryNode[]
}

export interface ContentTag {
  id: string
  name: string
  item_count: number
}

export const CONTENT_ITEMS_KEY = ['content-items'] as const
export const CONTENT_TAGS_KEY = ['content-tags'] as const

const cleanParams = (filters: ContentItemFilters) =>
  Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== '' && value !== false)
  )

export function useContentItems(filters: ContentItemFilters) {
  return useQuery({
    queryKey: [...CONTENT_ITEMS_KEY, 'list', filters],
    queryFn: async (): Promise<ContentItemList> => {
      const { data } = await api.get('/v1/contents/items', { params: cleanParams(filters) })
      return data.data
    },
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  })
}

export function useContentItem(id: string | undefined) {
  return useQuery({
    queryKey: [...CONTENT_ITEMS_KEY, 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ContentItem> => {
      const { data } = await api.get(`/v1/contents/items/${id}`)
      return data.data
    },
  })
}

/** 항목이 바뀌면 유형의 콘텐츠 수 · 태그 수도 다시 읽는다 */
function useInvalidateItems() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CONTENT_ITEMS_KEY }),
      queryClient.invalidateQueries({ queryKey: CONTENT_TYPES_KEY }),
      queryClient.invalidateQueries({ queryKey: CONTENT_TAGS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['content-categories'] }),
    ])
}

export function useCreateContentItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async (input: ContentItemInput): Promise<ContentItem> => {
      const { data } = await api.post('/v1/contents/items', input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateContentItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async ({ id, ...input }: ContentItemInput & { id: string }): Promise<ContentItem> => {
      const { data } = await api.patch(`/v1/contents/items/${id}`, input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteContentItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/contents/items/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useRestoreContentItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async (id: string): Promise<ContentItem> => {
      const { data } = await api.post(`/v1/contents/items/${id}/restore`)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDuplicateContentItem() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async (id: string): Promise<ContentItem> => {
      const { data } = await api.post(`/v1/contents/items/${id}/duplicate`)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useBulkContentItems() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async (input: {
      ids: string[]
      action: ContentBulkAction
    }): Promise<{ changed: number; skipped: string[] }> => {
      const { data } = await api.post('/v1/contents/items/bulk', input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useReorderContentItems() {
  const invalidate = useInvalidateItems()
  return useMutation({
    mutationFn: async (input: { type_id: string; ids: string[] }) => {
      await api.patch('/v1/contents/items/order', input)
    },
    onSettled: invalidate,
  })
}

/** 유형의 카테고리 트리 — 고르기 · 필터용 (관리 화면은 T-257) */
export function useContentCategories(typeId: string | undefined) {
  return useQuery({
    queryKey: ['content-categories', typeId],
    enabled: Boolean(typeId),
    queryFn: async (): Promise<ContentCategoryNode[]> => {
      const { data } = await api.get(`/v1/contents/types/${typeId}/categories`)
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

/** 사업체 공통 태그 — 입력 추천 · 필터용 */
export function useContentTags(enabled = true) {
  return useQuery({
    queryKey: CONTENT_TAGS_KEY,
    enabled,
    queryFn: async (): Promise<ContentTag[]> => {
      const { data } = await api.get('/v1/contents/tags')
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

/** 트리 → [{id, label}] — 하위는 '상위 › 하위' */
export function flattenCategories(nodes: ContentCategoryNode[]): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.name },
    ...node.children.map((child) => ({ id: child.id, label: `${node.name} › ${child.name}` })),
  ])
}

// ── 카테고리 · 태그 관리 (T-257, CM-05) ─────────────────────────────────────

function useInvalidateTaxonomy() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['content-categories'] }),
      queryClient.invalidateQueries({ queryKey: CONTENT_TAGS_KEY }),
      queryClient.invalidateQueries({ queryKey: CONTENT_ITEMS_KEY }),
    ])
}

export function useCreateContentCategory(typeId: string) {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async (input: { name: string; parent_id?: string | null }) => {
      const { data } = await api.post(`/v1/contents/types/${typeId}/categories`, input)
      return data.data as ContentCategoryNode
    },
    onSuccess: invalidate,
  })
}

export function useRenameContentCategory() {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.patch(`/v1/contents/categories/${id}`, { name })
    },
    onSuccess: invalidate,
  })
}

/** 트리 전체 — 목록 순서가 순서, parent_id 로 2단계 */
export function useSaveContentCategoryTree(typeId: string) {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async (nodes: { id: string; parent_id: string | null }[]) => {
      await api.put(`/v1/contents/types/${typeId}/categories/tree`, { nodes })
    },
    onSettled: invalidate,
  })
}

export function useDeleteContentCategory() {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async ({ id, moveTo }: { id: string; moveTo: string | null }) => {
      const { data } = await api.delete(`/v1/contents/categories/${id}`, {
        params: moveTo ? { move_to: moveTo } : undefined,
      })
      return data.data as { moved: number }
    },
    onSuccess: invalidate,
  })
}

export function useCreateContentTag() {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post('/v1/contents/tags', { name })
      return data.data as ContentTag
    },
    onSuccess: invalidate,
  })
}

export function useRenameContentTag() {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.patch(`/v1/contents/tags/${id}`, { name })
    },
    onSuccess: invalidate,
  })
}

export function useDeleteContentTag() {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/contents/tags/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useMergeContentTags() {
  const invalidate = useInvalidateTaxonomy()
  return useMutation({
    mutationFn: async (input: { source_ids: string[]; target_id: string }) => {
      const { data } = await api.post('/v1/contents/tags/merge', input)
      return data.data as { moved: number }
    },
    onSuccess: invalidate,
  })
}
