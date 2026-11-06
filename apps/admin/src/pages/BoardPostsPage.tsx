import { useState } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, ExternalLink, Pin, Plus } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'
import type { PostListItem, PostStatus } from '@cms/types'
import { Button, Input, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { useBoardCategories } from '@/hooks/useBoardCategories'
import { useBoardFields } from '@/hooks/useBoardFields'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type PostFilters,
  useBoards,
  useClearSamples,
  useDeletePost,
  usePosts,
  useRestorePost,
  useUpdatePost,
} from '@/hooks/useBoards'
import { useSiteMenu } from '@/hooks/useSiteSettings'
import { fieldValueLabel, isEmptyValue } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

export const STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: '임시저장',
  PUBLISHED: '공개',
  PRIVATE: '비공개',
}

export const STATUS_STYLES: Record<PostStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
  PRIVATE: 'bg-slate-100 text-slate-600',
}

const PAGE_SIZE = 20

/** 글 관리 (게시판 모듈 기획서 BM-05 · BM-07 의 1단계 범위) */
export function BoardPostsPage() {
  const { boardId = '' } = useParams()
  const canEdit = useCanEdit()
  const [filters, setFilters] = useState<PostFilters>({ page: 1, size: PAGE_SIZE })
  const [keyword, setKeyword] = useState('')

  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)
  const tenantSlug = useAuthStore((st) => st.tenantSlug)
  const isTheme = useSiteMenu().data?.mode === 'theme'
  const publishedId = (useLocation().state as { publishedId?: string } | null)?.publishedId
  // 테마형에는 공지 페이지가 없고, 사용 안 함 게시판은 열리지 않아 링크를 두지 않는다
  const publishedUrl =
    publishedId && board && tenantSlug && board.status === 'ACTIVE' && !(board.system_key && isTheme)
      ? `${CLIENT_BASE_URL}/${tenantSlug}/${board.system_key ?? `b/${board.slug}`}/${publishedId}`
      : null
  const postsQuery = usePosts(boardId, filters)
  // 기본 게시판에는 칸 · 분류가 없다
  const categories = useBoardCategories(boardId, { enabled: Boolean(board && !board.system_key) }).data ?? []
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const listFields = (useBoardFields(boardId, { enabled: Boolean(board && !board.system_key) }).data ?? []).filter(
    (field) => field.show_in_list,
  )
  const updatePost = useUpdatePost(boardId)
  const deletePost = useDeletePost(boardId)
  const restorePost = useRestorePost(boardId)
  const clearSamples = useClearSamples()

  const fail = (fallback: string) => (error: unknown) =>
    toast.error(pickErrorMessage(error, fallback))

  const togglePin = (post: PostListItem) =>
    updatePost.mutate(
      { id: post.id, payload: { is_pinned: !post.is_pinned } },
      { onError: fail('상단 고정을 바꾸지 못했습니다.') },
    )

  const toggleVisible = (post: PostListItem) =>
    updatePost.mutate(
      { id: post.id, payload: { status: post.status === 'PUBLISHED' ? 'PRIVATE' : 'PUBLISHED' } },
      { onError: fail('공개 여부를 바꾸지 못했습니다.') },
    )

  const handleDelete = (post: PostListItem) =>
    deletePost.mutate(post.id, {
      onSuccess: () => toast.success('휴지통으로 옮겼습니다.'),
      onError: fail('삭제하지 못했습니다.'),
    })

  const handleRestore = (post: PostListItem) =>
    restorePost.mutate(post.id, {
      onSuccess: () => toast.success('글을 복원했습니다.'),
      onError: fail('복원하지 못했습니다.'),
    })

  const handleClearSamples = () => {
    if (!window.confirm('홈페이지에 보이는 샘플 공지를 지웁니다. 되돌릴 수 없습니다.')) return
    clearSamples.mutate(undefined, {
      onSuccess: () => toast.success('샘플 글을 지웠습니다.'),
      onError: fail('샘플 글을 지우지 못했습니다.'),
    })
  }

  const data = postsQuery.data
  const page = filters.page
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader
        boardId={boardId}
        actions={
          canEdit && (
            <Link
              to={`/admin/boards/${boardId}/posts/new`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              글쓰기
            </Link>
          )
        }
      />

      {publishedUrl && (
        <p className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          글을 공개했습니다.
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium underline">
            <ExternalLink className="h-4 w-4" aria-hidden />
            홈페이지에서 보기
          </a>
        </p>
      )}

      {board?.has_samples && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            홈페이지에는 지금 샘플 공지가 보입니다. 글을 공개하면 샘플은 자동으로 사라집니다.
          </p>
          {canEdit && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={clearSamples.isPending}
              onClick={handleClearSamples}
            >
              샘플 글 지우기
            </Button>
          )}
        </div>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setFilters({ ...filters, page: 1, q: keyword.trim() || undefined })
        }}
      >
        <div className="w-full sm:w-64">
          <Input
            aria-label="제목 검색"
            placeholder="제목 검색"
            value={keyword}
            maxLength={100}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select
          aria-label="상태"
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={filters.trash ? 'TRASH' : (filters.status ?? '')}
          onChange={(e) => {
            const value = e.target.value
            setFilters({
              ...filters,
              page: 1,
              trash: value === 'TRASH' || undefined,
              status: value && value !== 'TRASH' ? (value as PostStatus) : undefined,
            })
          }}
        >
          <option value="">전체</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="TRASH">휴지통</option>
        </select>
        {categories.length > 0 && (
          <select
            aria-label="카테고리"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={filters.category_id ?? ''}
            onChange={(e) => setFilters({ ...filters, page: 1, category_id: e.target.value || undefined })}
          >
            <option value="">모든 카테고리</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {postsQuery.isLoading && <p className="p-8 text-center text-sm text-slate-400">불러오는 중…</p>}
        {postsQuery.isError && (
          <p className="p-8 text-center text-sm text-red-600">글을 불러오지 못했습니다.</p>
        )}
        {data?.items.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            {filters.trash ? '휴지통이 비어 있습니다.' : '글이 없습니다.'}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {data?.items.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex items-center gap-2">
                  {post.is_pinned && <Pin className="h-4 w-4 shrink-0 text-blue-600" aria-label="상단 고정" />}
                  {post.deleted_at ? (
                    <span className="truncate font-medium text-slate-500">{post.title}</span>
                  ) : (
                    <Link
                      to={`/admin/boards/${boardId}/posts/${post.id}/edit`}
                      className="truncate font-medium text-slate-900 hover:underline"
                    >
                      {post.title}
                    </Link>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[post.status]}`}>
                    {STATUS_LABELS[post.status]}
                  </span>
                  {post.author_member_id && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                      회원 작성{post.author_member_name ? ` · ${post.author_member_name}` : ''}
                    </span>
                  )}
                  {post.category_id && categoryName.has(post.category_id) && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                      {categoryName.get(post.category_id)}
                    </span>
                  )}
                  <time dateTime={post.published_at ?? post.created_at}>
                    {dayjs(post.published_at ?? post.created_at).format('YYYY.MM.DD')}
                  </time>
                </div>
                {listFields.some((field) => !isEmptyValue(post.custom_data?.[field.field_key])) && (
                  <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {listFields
                      .filter((field) => !isEmptyValue(post.custom_data?.[field.field_key]))
                      .map((field) => (
                        <div key={field.id} className="flex min-w-0 gap-1">
                          <dt className="shrink-0">{field.label}:</dt>
                          <dd className="truncate text-slate-700">
                            {fieldValueLabel(field, post.custom_data?.[field.field_key])}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
              </div>

              {canEdit && post.deleted_at && (
                <Button type="button" variant="secondary" size="sm" onClick={() => handleRestore(post)}>
                  복원
                </Button>
              )}
              {canEdit && !post.deleted_at && (
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => togglePin(post)}>
                    {post.is_pinned ? '고정 해제' : '상단 고정'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleVisible(post)}>
                    {post.status === 'PUBLISHED' ? '비공개로' : '공개하기'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(post)}>
                    삭제
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-slate-100 p-3 text-sm text-slate-600">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="이전 페이지"
              disabled={page <= 1}
              onClick={() => setFilters({ ...filters, page: page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="다음 페이지"
              disabled={page >= totalPages}
              onClick={() => setFilters({ ...filters, page: page + 1 })}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
