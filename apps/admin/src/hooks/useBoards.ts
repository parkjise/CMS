import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AuditLogKind,
  AuditLogList,
  BoardDesign,
  BoardOperation,
  BoardPermissions,
  BoardSortOrder,
  Board,
  BoardLimits,
  BoardPresetField,
  BoardStatus,
  BoardType,
  BodyNode,
  Post,
  PostBulkAction,
  PostList,
  PostMoveInput,
  PostMovePreview,
  PostMoveResult,
  PostOverviewList,
  PermissionOptions,
  PostAttachment,
  PostStatus,
  PostVersion,
  PostVersionDetail,
  ReportAction,
  ReportedPost,
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
  is_secret?: boolean
  /** 분류 (T-149) — null 은 분류 없음 */
  category_id?: string | null
  /** 예약 공개 시각 (T-189) — null 은 예약을 풀고 바로 공개 */
  published_at?: string | null
  /** 첨부 (T-194) — 먼저 올린 파일 id, 이 순서대로. 빈 목록은 모두 뺀다 */
  attachment_ids?: string[]
}

export interface PostOverviewFilters extends PostFilters {
  author?: string
  body_q?: string
  board_id?: string
  created_from?: string
  created_before?: string
  updated_from?: string
  updated_before?: string
  published_from?: string
  published_before?: string
}

const BOARDS_KEY = ['boards'] as const
export const AUDIT_PAGE_SIZE = 20
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
  operation?: BoardOperation
  /** 추가할 때만 — 끄면 상단 메뉴에서 숨긴다 */
  in_menu?: boolean
  /** 새 게시판과 함께 만들 추천 칸 키 (T-183) */
  preset_fields?: string[]
}

/** 권한 탭 — 회원 읽기 · 글쓰기를 고를 수 없는 이유 (T-150-B) */
export function usePermissionOptions(boardId: string) {
  return useQuery({
    queryKey: [...BOARDS_KEY, boardId, 'permission-options'],
    queryFn: async (): Promise<PermissionOptions> => {
      const { data } = await api.get(`/v1/boards/${boardId}/permission-options`)
      return data.data
    },
  })
}

const REPORTS_KEY = [...BOARDS_KEY, 'reports'] as const

/** 처리하지 않은 신고가 있는 글 (T-151-B) */
export function useReportedPosts() {
  return useQuery({
    queryKey: REPORTS_KEY,
    queryFn: async (): Promise<ReportedPost[]> => {
      const { data } = await api.get('/v1/posts/reports')
      return data.data
    },
  })
}

/** 신고 처리 — 그대로 두기 · 다시 공개 · 비공개 · 휴지통 */
export function useResolveReports() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      postId,
      action,
    }: {
      postId: string
      action: ReportAction
    }): Promise<void> => {
      await api.post(`/v1/posts/${postId}/reports/resolve`, { action })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOARDS_KEY }),
  })
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

/** 새 게시판 유형별 추천 칸 (T-183) */
export function useBoardPresets() {
  return useQuery({
    queryKey: [...BOARDS_KEY, 'presets'],
    queryFn: async (): Promise<Record<BoardType, BoardPresetField[]>> => {
      const { data } = await api.get('/v1/boards/presets')
      return data.data
    },
    staleTime: Infinity,
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

/** 변경 기록 (T-186) — 게시판 키 아래라 게시판 · 글을 바꾸면 함께 새로 읽는다 */
export function useAuditLogs(kind: AuditLogKind | null, page: number) {
  return useQuery({
    queryKey: [...BOARDS_KEY, 'audit-logs', kind, page],
    queryFn: async (): Promise<AuditLogList> => {
      const { data } = await api.get('/v1/audit-logs', {
        params: { page, limit: AUDIT_PAGE_SIZE, ...(kind ? { kind } : {}) },
      })
      return data.data
    },
    placeholderData: keepPreviousData,
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
    mutationFn: async (payload: {
      post_ids: string[]
      action: PostBulkAction
    }): Promise<number> => {
      const { data } = await api.post('/v1/posts/bulk', payload)
      return data.data.updated
    },
    onSuccess: invalidate,
  })
}

/** 다른 게시판으로 옮기기 미리보기 (T-184) — 아무것도 바꾸지 않는다 */
export function usePostMovePreview() {
  return useMutation({
    mutationFn: async (payload: PostMoveInput): Promise<PostMovePreview> => {
      const { data } = await api.post('/v1/posts/move/preview', payload)
      return data.data
    },
  })
}

/** 글을 옮긴다 — 두 게시판의 글 수 · 분류 글 수가 함께 바뀐다 */
export function useMovePosts() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (payload: PostMoveInput): Promise<PostMoveResult> => {
      const { data } = await api.post('/v1/posts/move', payload)
      return data.data
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

/** 글의 이전 버전 (T-191) — 글을 저장하면 하나 늘어난다 */
export function usePostVersions(boardId: string, postId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...postsKey(boardId), 'detail', postId, 'versions'],
    queryFn: async (): Promise<PostVersion[]> => {
      const { data } = await api.get(`/v1/boards/${boardId}/posts/${postId}/versions`)
      return data.data
    },
    enabled: Boolean(postId) && enabled,
  })
}

export function usePostVersion(boardId: string, postId: string, versionId: string | null) {
  return useQuery({
    queryKey: [...postsKey(boardId), 'detail', postId, 'versions', versionId],
    queryFn: async (): Promise<PostVersionDetail> => {
      const { data } = await api.get(`/v1/boards/${boardId}/posts/${postId}/versions/${versionId}`)
      return data.data
    },
    enabled: Boolean(versionId),
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

/** 휴지통 게시판 영구 삭제 (T-196) — 글 · 필드 · 카테고리도 함께 */
export function usePurgeBoard() {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/v1/boards/${id}/permanent`)
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

/** 글에 붙일 파일을 올린다 (T-194) — 글을 저장해야 붙는다 */
export function useUploadAttachment(boardId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<PostAttachment> => {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/v1/boards/${boardId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.data
    },
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

/** 휴지통 글 영구 삭제 (T-196) */
export function usePurgePost(boardId: string) {
  const invalidate = useInvalidateBoards()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/v1/boards/${boardId}/posts/${id}/permanent`)
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
