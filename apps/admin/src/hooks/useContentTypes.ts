import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FieldOption } from '@cms/types'
import { api } from '@/lib/api'

/** 콘텐츠 관리 스위치 (T-253, 콘텐츠 관리 기획서) — 기본 꺼짐 */
export const CONTENT_MANAGE = 'CONTENT_MANAGE'

/** 콘텐츠 유형 칸 종류 — 게시판 칸에서 별점만 뺀다 */
export type ContentFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DATE'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'BOOLEAN'
  | 'IMAGE'
  | 'PHONE'
  | 'EMAIL'
  | 'URL'

export interface ContentField {
  id: string
  field_key: string
  label: string
  field_type: ContentFieldType
  is_required: boolean
  help_text: string
  placeholder: string
  default_value: unknown
  /** {choices: [{value, label}], min, max} — 종류에 따라 쓰는 값만 */
  field_options: { choices?: FieldOption[]; min?: number; max?: number }
  display_order: number
}

export interface ContentType {
  id: string
  type_key: string
  name: string
  description: string
  preset_key: string | null
  display_order: number
  fields: ContentField[]
  item_count: number
  published_count: number
  updated_at: string
  deleted_at: string | null
}

export interface ContentTypeLimits {
  plan: string
  /** null = 제한 없음 */
  limit: number | null
  used: number
  can_create: boolean
  reason: string | null
}

export interface ContentPreset {
  key: string
  name: string
  description: string
  /** 더해지는 칸 이름 */
  fields: string[]
}

export interface ContentTypeList {
  /** CONTENT_MANAGE 스위치 — 꺼져 있으면 목록만 */
  enabled: boolean
  types: ContentType[]
  trash: ContentType[]
  limits: ContentTypeLimits
  presets: ContentPreset[]
}

export interface ContentTypeInput {
  preset_key?: string
  name?: string
  type_key?: string
  description?: string
}

/** 칸 전체 저장의 한 줄 — id 가 없으면 새 칸 */
export interface ContentFieldInput {
  id?: string
  field_key?: string
  label: string
  field_type: ContentFieldType
  is_required: boolean
  help_text: string
  placeholder: string
  options?: FieldOption[]
  min?: number | null
  max?: number | null
}

export const CONTENT_TYPES_KEY = ['content-types'] as const

export function useContentTypes() {
  return useQuery({
    queryKey: CONTENT_TYPES_KEY,
    queryFn: async (): Promise<ContentTypeList> => {
      const { data } = await api.get('/v1/contents/types')
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useContentType(id: string | undefined) {
  return useQuery({
    queryKey: [...CONTENT_TYPES_KEY, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ContentType> => {
      const { data } = await api.get(`/v1/contents/types/${id}`)
      return data.data
    },
  })
}

/** 유형이 바뀌면 항목 목록(유형 이름 · 칸)도 다시 읽는다 */
function useInvalidateTypes() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CONTENT_TYPES_KEY }),
      queryClient.invalidateQueries({ queryKey: ['content-items'] }),
    ])
}

export function useCreateContentType() {
  const invalidate = useInvalidateTypes()
  return useMutation({
    mutationFn: async (input: ContentTypeInput): Promise<ContentType> => {
      const { data } = await api.post('/v1/contents/types', input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateContentType() {
  const invalidate = useInvalidateTypes()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: ContentTypeInput & { id: string }): Promise<ContentType> => {
      const { data } = await api.patch(`/v1/contents/types/${id}`, input)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useSaveContentFields() {
  const invalidate = useInvalidateTypes()
  return useMutation({
    mutationFn: async ({
      id,
      fields,
    }: {
      id: string
      fields: ContentFieldInput[]
    }): Promise<ContentType> => {
      const { data } = await api.put(`/v1/contents/types/${id}/fields`, { fields })
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteContentType() {
  const invalidate = useInvalidateTypes()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/contents/types/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useRestoreContentType() {
  const invalidate = useInvalidateTypes()
  return useMutation({
    mutationFn: async (id: string): Promise<ContentType> => {
      const { data } = await api.post(`/v1/contents/types/${id}/restore`)
      return data.data
    },
    onSuccess: invalidate,
  })
}

/** 순서 — 낙관적으로 바로 바꾸고 실패하면 되돌린다 */
export function useReorderContentTypes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await api.patch('/v1/contents/types/order', { ids })
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: CONTENT_TYPES_KEY })
      const previous = queryClient.getQueryData<ContentTypeList>(CONTENT_TYPES_KEY)
      if (previous) {
        const byId = new Map(previous.types.map((t) => [t.id, t]))
        const types = ids
          .map((id, order) => {
            const type = byId.get(id)
            return type ? { ...type, display_order: order } : null
          })
          .filter((t): t is ContentType => t !== null)
        queryClient.setQueryData<ContentTypeList>(CONTENT_TYPES_KEY, { ...previous, types })
      }
      return { previous }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(CONTENT_TYPES_KEY, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONTENT_TYPES_KEY }),
  })
}
