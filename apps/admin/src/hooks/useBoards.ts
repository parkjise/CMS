import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Board, BodyBlock, Post, PostList, PostStatus } from '@cms/types'
import { api } from '@/lib/api'

/** 게시판 관리 (T-139, 게시판 모듈 기획서 4 · 9장) */

export interface PostFilters {
  page: number
  size?: number
  status?: PostStatus
  q?: string
  trash?: boolean
}

export interface PostInput {
  title?: string
  body?: BodyBlock[]
  status?: PostStatus
  is_pinned?: boolean
}

const BOARDS_KEY = ['boards'] as const
const postsKey = (boardId: string) => ['boards', boardId, 'posts'] as const

export function useBoards() {
  return useQuery({
    queryKey: BOARDS_KEY,
    queryFn: async (): Promise<Board[]> => {
      const { data } = await api.get('/v1/boards')
      return data.data
    },
  })
}

export function usePosts(boardId: string, filters: PostFilters) {
  return useQuery({
    queryKey: [...postsKey(boardId), filters],
    queryFn: async (): Promise<PostList> => {
      const { data } = await api.get(`/v1/boards/${boardId}/posts`, {
        params: { size: 20, ...filters },
      })
      return data.data
    },
    placeholderData: keepPreviousData,
  })
}

export function usePost(boardId: string, postId: string | undefined) {
  return useQuery({
    queryKey: [...postsKey(boardId), 'detail', postId],
    queryFn: async (): Promise<Post> => {
      const { data } = await api.get(`/v1/boards/${boardId}/posts/${postId}`)
      return data.data
    },
    enabled: Boolean(postId),
  })
}

/** 글이 바뀌면 글 수 · 샘플 여부가 함께 바뀌므로 게시판 전체를 다시 읽는다 */
const useInvalidateBoards = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: BOARDS_KEY })
}

export function useCreatePost(boardId: string) {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (payload: PostInput): Promise<Post> => {
      const { data } = await api.post(`/v1/boards/${boardId}/posts`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdatePost(boardId: string) {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: PostInput }): Promise<Post> => {
      const { data } = await api.patch(`/v1/boards/${boardId}/posts/${id}`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDeletePost(boardId: string) {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/v1/boards/${boardId}/posts/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useRestorePost(boardId: string) {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.post(`/v1/boards/${boardId}/posts/${id}/restore`)
    },
    onSuccess: invalidate,
  })
}

export function useClearSamples() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.post('/v1/boards/clear-samples')
    },
    onSuccess: invalidate,
  })
}
