import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BoardField, FieldOption, FieldType } from '@cms/types'
import { api } from '@/lib/api'

/** 게시판 칸 (T-142, 게시판 모듈 기획서 BM-04) */

export interface FieldInput {
  label?: string
  field_type?: FieldType
  field_key?: string
  is_required?: boolean
  is_visible?: boolean
  help_text?: string
  placeholder?: string
  default_value?: unknown
  options?: FieldOption[]
  min?: number | null
  max?: number | null
  show_in_list?: boolean
}

const fieldsKey = (boardId: string) => ['boards', boardId, 'fields'] as const

export function useBoardFields(boardId: string, { trash = false, enabled = true } = {}) {
  return useQuery({
    queryKey: [...fieldsKey(boardId), { trash }],
    queryFn: async (): Promise<BoardField[]> => {
      const { data } = await api.get(`/v1/boards/${boardId}/fields`, trash ? { params: { trash } } : undefined)
      return data.data
    },
    enabled,
  })
}

const useInvalidateFields = (boardId: string) => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: fieldsKey(boardId) })
}

export function useCreateField(boardId: string) {
  const invalidate = useInvalidateFields(boardId)
  return useMutation({
    mutationFn: async (payload: FieldInput): Promise<BoardField> => {
      const { data } = await api.post(`/v1/boards/${boardId}/fields`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateField(boardId: string) {
  const invalidate = useInvalidateFields(boardId)
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: FieldInput }): Promise<BoardField> => {
      const { data } = await api.patch(`/v1/boards/${boardId}/fields/${id}`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteField(boardId: string) {
  const invalidate = useInvalidateFields(boardId)
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/v1/boards/${boardId}/fields/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useRestoreField(boardId: string) {
  const invalidate = useInvalidateFields(boardId)
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.post(`/v1/boards/${boardId}/fields/${id}/restore`)
    },
    onSuccess: invalidate,
  })
}

export function useReorderFields(boardId: string) {
  const invalidate = useInvalidateFields(boardId)
  return useMutation({
    mutationFn: async (fieldIds: string[]): Promise<void> => {
      await api.patch(`/v1/boards/${boardId}/fields/order`, { field_ids: fieldIds })
    },
    onSettled: invalidate,
  })
}

/** 쓰고 있는 선택지의 글을 다른 선택지로 옮긴다 (T-180) — target 이 null 이면 값을 비운다 */
export function useRemapChoice(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      fieldId,
      source,
      target,
    }: {
      fieldId: string
      source: string
      target: string | null
    }): Promise<number> => {
      const { data } = await api.post(`/v1/boards/${boardId}/fields/${fieldId}/choices/remap`, {
        source,
        target,
      })
      return data.data.moved
    },
    // 글 값이 바뀌므로 칸(글 수)과 글 목록을 모두 다시 읽는다
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards', boardId] }),
        queryClient.invalidateQueries({ queryKey: ['boards', 'overview'] }),
      ]),
  })
}
