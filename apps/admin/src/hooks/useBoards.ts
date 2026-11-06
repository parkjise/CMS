import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BoardDesign,
  BoardPermissions,
  BoardSortOrder,
  Board,
  BoardLimits,
  BoardStatus,
  BoardType,
  BodyNode,
  Post,
  PostBulkAction,
  PostList,
  PostOverviewList,
  PostStatus,
} from '@cms/types'
import { api } from '@/lib/api'
import { MENU_KEY } from '@/hooks/useSiteSettings'

/** 게시판 관리 (T-139, 게시판 모듈 기획서 4 · 9장) */

export interface PostFilters {
  page: number
  size?: number
  status?: PostStatus
  q?: string
  trash?: boolean
  category_id?: string
}

export interface PostInput {
  title?: string
  body?: BodyNode[]
  status?: PostStatus
  is_pinned?: boolean
  /** 분류 (T-149) — null 은 분류 없음 */
  category_id?: string | null
}

export interface PostOverviewFilters extends PostFilters {
  board_id?: string
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

export interface BoardInput {
  name?: string
  description?: string
  slug?: string
  board_type?: BoardType
  status?: BoardStatus
  sort_order?: BoardSortOrder
  page_size?: number | null
  seo_title?: string
  seo_description?: string
  seo_index?: boolean
  design?: BoardDesign
  permissions?: BoardPermissions
  /** 추가할 때만 — 끄면 상단 메뉴에서 숨긴다 */
  in_menu?: boolean
}

export function useBoardLimits() {
  return useQuery({
    queryKey: [...BOARDS_KEY, 'limits'],
    queryFn: async (): Promise<BoardLimits> => {
      const { data } = await api.get('/v1/boards/limits')
      return data.data
    },
  })
}

export function useTrashedBoards() {
  return useQuery({
    queryKey: [...BOARDS_KEY, 'trash'],
    queryFn: async (): Promise<Board[]> => {
      const { data } = await api.get('/v1/boards', { params: { trash: true } })
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

/** 전체 글 (BM-05, T-140-C) — 게시판을 건드리는 키 아래 두어 글이 바뀌면 함께 새로 읽는다 */
export function usePostOverview(filters: PostOverviewFilters) {
  return useQuery({
    queryKey: [...BOARDS_KEY, 'overview', filters],
    queryFn: async (): Promise<PostOverviewList> => {
      const { data } = await api.get('/v1/posts', { params: { size: 20, ...filters } })
      return data.data
    },
    placeholderData: keepPreviousData,
  })
}

export function useBulkPosts() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (payload: { post_ids: string[]; action: PostBulkAction }): Promise<number> => {
      const { data } = await api.post('/v1/posts/bulk', payload)
      return data.data.updated
    },
    onSuccess: invalidate,
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

/** 글이 바뀌면 글 수 · 샘플 여부가 함께 바뀌므로 게시판 전체를 다시 읽는다. 게시판은 상단 메뉴 후보이기도 하다 */
const useInvalidateBoards = () => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: BOARDS_KEY }),
      queryClient.invalidateQueries({ queryKey: MENU_KEY }),
    ])
}

export function useCreateBoard() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (payload: BoardInput): Promise<Board> => {
      const { data } = await api.post('/v1/boards', payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateBoard() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: BoardInput }): Promise<Board> => {
      const { data } = await api.patch(`/v1/boards/${id}`, payload)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDuplicateBoard() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<Board> => {
      const { data } = await api.post(`/v1/boards/${id}/duplicate`)
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteBoard() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/v1/boards/${id}`)
    },
    onSuccess: invalidate,
  })
}

export function useRestoreBoard() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<{ board: Board; slug_changed: boolean }> => {
      const { data } = await api.post(`/v1/boards/${id}/restore`)
      return data.data
    },
    onSuccess: invalidate,
  })
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
