import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BoardCategory } from '@cms/types'
import { api } from '@/lib/api'

/** 게시판 카테고리 (T-149, 게시판 모듈 기획서 BM-09) */

export interface CategoryInput {
  name?: string
  is_active?: boolean
}

const categoriesKey = (boardId: string) => ['boards', boardId, 'categories'] as const

export function useBoardCategories(boardId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: categoriesKey(boardId),
    queryFn: async (): Promise<BoardCategory[]> => {
      const { data } = await api.get(`/v1/boards/${boardId}/categories`)
      return data.data
    },
    enabled,
  })
}

const useInvalidateCategories = (boardId: string) => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: categoriesKey(boardId) })
}

export function useCreateCategory(boardId: string) {
  const invalidate = useInvalidateCategories(boardId)
  return useMutation({
    mutationFn: async (payload: CategoryInput): Promise<BoardCategory> => {
      const { data } = await api.post(`/v1/boards/${boardId}/categories`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCategory(boardId: string) {
  const invalidate = useInvalidateCategories(boardId)
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: CategoryInput }): Promise<BoardCategory> => {
      const { data } = await api.patch(`/v1/boards/${boardId}/categories/${id}`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

/** 지우고 글을 옮긴다 — moveTo 가 null 이면 분류 없음 */
export function useDeleteCategory(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, moveTo }: { id: string; moveTo: string | null }): Promise<number> => {
      const { data } = await api.delete(`/v1/boards/${boardId}/categories/${id}`, {
        params: moveTo ? { move_to: moveTo } : undefined,
      })
      return data.data.moved
    },
    // 글의 분류가 바뀌므로 글 목록도 다시 읽는다
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards', boardId] }),
  })
}

export function useReorderCategories(boardId: string) {
  const invalidate = useInvalidateCategories(boardId)
  return useMutation({
    mutationFn: async (categoryIds: string[]): Promise<void> => {
      await api.patch(`/v1/boards/${boardId}/categories/order`, { category_ids: categoryIds })
    },
    onSettled: invalidate,
  })
}
