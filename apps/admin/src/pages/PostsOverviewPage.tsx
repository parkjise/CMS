import { type FormEvent, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { PostBulkAction, PostStatus } from '@cms/types'
import { Button, Input, toast } from '@cms/ui'
import { PostListFields } from '@/components/boards/PostListFields'
import { isEmptyValue } from '@/lib/customFields'
import { useBoardCategories } from '@/hooks/useBoardCategories'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type PostOverviewFilters,
  useBoards,
  useBulkPosts,
  usePostOverview,
} from '@/hooks/useBoards'
import { postDateFilters } from '@/lib/postDateFilters'
import { pickErrorMessage } from '@/lib/errorMessages'
import { STATUS_LABELS, STATUS_STYLES } from '@/pages/BoardPostsPage'

const PAGE_SIZE = 20

const BULK_DONE: Record<PostBulkAction, string> = {
  PUBLISH: '공개했습니다.',
  PRIVATE: '비공개로 바꿨습니다.',
  TRASH: '휴지통으로 옮겼습니다.',
  RESTORE: '복원했습니다.',
}

/** 전체 글 (BM-05) — 여러 게시판의 글을 찾아 한 번에 처리한다. 선택은 지금 페이지 안에서만 */
export function PostsOverviewPage() {
  const canEdit = useCanEdit()
  const [filters, setFilters] = useState<PostOverviewFilters>({ page: 1, size: PAGE_SIZE })
  const [keyword, setKeyword] = useState('')
  const [author, setAuthor] = useState('')
  const [bodyKeyword, setBodyKeyword] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dateField, setDateField] = useState<'created' | 'updated' | 'published'>('created')
  const dateLabel = { created: '작성일', updated: '수정일', published: '공개일' }[dateField]
  const [dateError, setDateError] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const boardsQuery = useBoards()
  const selectedBoard = boardsQuery.data?.find((board) => board.id === filters.board_id)
  const canFilterCategory = Boolean(selectedBoard && !selectedBoard.system_key)
  const categoriesQuery = useBoardCategories(filters.board_id ?? '', { enabled: canFilterCategory })
  const categories = canFilterCategory ? (categoriesQuery.data ?? []) : []
  let categoryPlaceholder = '모든 카테고리'
  if (!selectedBoard) categoryPlaceholder = '게시판을 먼저 선택하세요'
  else if (!canFilterCategory) categoryPlaceholder = '카테고리 없음'
  else if (categoriesQuery.isPending) categoryPlaceholder = '불러오는 중…'
  else if (categoriesQuery.isError) categoryPlaceholder = '불러오기 실패'
  else if (categories.length === 0) categoryPlaceholder = '카테고리 없음'
  // 합치기/삭제 뒤 사라진 분류 조건이 숨은 채로 남지 않게 한다.
  useEffect(() => {
    if (
      filters.category_id &&
      canFilterCategory &&
      categoriesQuery.isSuccess &&
      !categoriesQuery.data?.some((category) => category.id === filters.category_id)
    ) {
      setSelected([])
      setFilters((current) => ({ ...current, category_id: undefined, page: 1 }))
    }
  }, [filters.category_id, canFilterCategory, categoriesQuery.isSuccess, categoriesQuery.data])

  const postsQuery = usePostOverview(filters)
  const bulk = useBulkPosts()

  const data = postsQuery.data
  const items = data?.items ?? []
  const page = filters.page
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const inTrash = Boolean(filters.trash)
  const allChecked = items.length > 0 && items.every((post) => selected.includes(post.id))

  // 목록이 바뀌면 선택을 비운다 — 보이지 않는 글이 함께 처리되지 않게
  const changeFilters = (next: Partial<PostOverviewFilters>) => {
    setSelected([])
    setFilters({ ...filters, page: 1, ...next })
  }

  const toggle = (id: string) =>
    setSelected((list) => (list.includes(id) ? list.filter((v) => v !== id) : [...list, id]))

  const search = (event: FormEvent) => {
    event.preventDefault()
    try {
      const dates = postDateFilters(startDate, endDate)
      setDateError('')
      changeFilters({
        q: keyword.trim() || undefined,
        author: author.trim() || undefined,
        body_q: bodyKeyword.trim() || undefined,
        created_from: dateField === 'created' ? dates.created_from : undefined,
        created_before: dateField === 'created' ? dates.created_before : undefined,
        updated_from: dateField === 'updated' ? dates.created_from : undefined,
        updated_before: dateField === 'updated' ? dates.created_before : undefined,
        published_from: dateField === 'published' ? dates.created_from : undefined,
        published_before: dateField === 'published' ? dates.created_before : undefined,
      })
    } catch (error) {
      setDateError(
        error instanceof Error
          ? error.message.replaceAll('작성일', dateLabel)
          : `${dateLabel}을 확인해주세요.`
      )
    }
  }

  const run = (action: PostBulkAction) => {
    if (action === 'TRASH' && !window.confirm(`글 ${selected.length}개를 휴지통으로 옮길까요?`))
      return
    bulk.mutate(
      { post_ids: selected, action },
      {
        onSuccess: (count) => {
          setSelected([])
          toast.success(`글 ${count}개를 ${BULK_DONE[action]}`)
        },
        onError: (error) =>
          toast.error(pickErrorMessage(error, '처리하지 못했습니다. 아무 글도 바뀌지 않았습니다.')),
      }
    )
  }

  return (
    <div className="space-y-5 p-6 md:p-8">
      <div>
        <Link to="/admin/boards" className="text-sm text-slate-500 hover:text-slate-700">
          ← 게시판 관리
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">전체 글</h1>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="posts-board" className="mb-1.5 block text-sm font-medium text-slate-700">
            게시판
          </label>
          <select
            id="posts-board"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            value={filters.board_id ?? ''}
            onChange={(e) =>
              changeFilters({ board_id: e.target.value || undefined, category_id: undefined })
            }
          >
            <option value="">전체</option>
            {boardsQuery.data?.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="posts-category"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            카테고리
          </label>
          <select
            id="posts-category"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"
            value={filters.category_id ?? ''}
            disabled={
              !canFilterCategory ||
              categoriesQuery.isPending ||
              categoriesQuery.isError ||
              categories.length === 0
            }
            onChange={(e) => changeFilters({ category_id: e.target.value || undefined })}
          >
            <option value="">{categoryPlaceholder}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.is_active ? '' : ' (숨김)'}
              </option>
            ))}
          </select>
          {canFilterCategory && categoriesQuery.isError && (
            <div className="mt-1 text-sm text-red-600" role="alert">
              카테고리를 불러오지 못했습니다.
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => void categoriesQuery.refetch()}
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
        {!inTrash && (
          <div>
            <label
              htmlFor="posts-status"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              상태
            </label>
            <select
              id="posts-status"
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              value={filters.status ?? ''}
              onChange={(e) =>
                changeFilters({ status: (e.target.value || undefined) as PostStatus | undefined })
              }
            >
              <option value="">전체</option>
              {(Object.keys(STATUS_LABELS) as PostStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        )}
        <form className="flex flex-wrap items-end gap-2" onSubmit={search} role="search">
          <Input
            label="제목 검색"
            value={keyword}
            maxLength={100}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Input
            label="본문 검색"
            value={bodyKeyword}
            maxLength={100}
            placeholder="문단 안의 글자"
            onChange={(event) => setBodyKeyword(event.target.value)}
          />
          <Input
            label="회원·비회원 작성자 검색"
            value={author}
            maxLength={100}
            placeholder="목록에 표시되는 이름"
            onChange={(event) => setAuthor(event.target.value)}
          />
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">날짜 기준</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={dateField}
              onChange={(event) => {
                const value = event.target.value
                setDateField(value === 'updated' || value === 'published' ? value : 'created')
                setDateError('')
              }}
            >
              <option value="created">작성일</option>
              <option value="updated">수정일</option>
              <option value="published">공개일</option>
            </select>
          </label>
          <Input
            label={`${dateLabel} 시작`}
            type="date"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value)
              setDateError('')
            }}
          />
          <Input
            label={`${dateLabel} 종료`}
            type="date"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value)
              setDateError('')
            }}
          />
          <Button type="submit" variant="secondary">
            검색
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={
              !startDate &&
              !endDate &&
              !filters.created_from &&
              !filters.created_before &&
              !filters.updated_from &&
              !filters.updated_before &&
              !filters.published_from &&
              !filters.published_before
            }
            onClick={() => {
              setStartDate('')
              setEndDate('')
              setDateError('')
              changeFilters({
                created_from: undefined,
                created_before: undefined,
                updated_from: undefined,
                updated_before: undefined,
                published_from: undefined,
                published_before: undefined,
              })
            }}
          >
            기간 초기화
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={inTrash}
          onClick={() => changeFilters({ trash: !inTrash || undefined, status: undefined })}
        >
          {inTrash ? '휴지통 닫기' : '휴지통 보기'}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        작성일은 최초 저장일, 수정일은 마지막 갱신 시각입니다. 처음 만든 글도 수정일이 있습니다.
        공개일은 최초 공개 시각이며, 기간 검색에서는 한 번도 공개하지 않은 글을 제외합니다. 현재
        공개 중인 글만 찾으려면 상태도 공개로 선택해 주세요. 브라우저 시간대 기준이며 종료일을
        포함합니다. 날짜 기준과 기간은 검색을 눌러 적용합니다.
      </p>
      {dateError && (
        <p role="alert" className="text-sm text-red-600">
          {dateError}
        </p>
      )}

      {canEdit && selected.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3"
          role="group"
          aria-label="선택한 글 처리"
        >
          <span className="text-sm font-medium text-blue-900">{selected.length}개 선택</span>
          {inTrash ? (
            <Button type="button" size="sm" loading={bulk.isPending} onClick={() => run('RESTORE')}>
              복원
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                loading={bulk.isPending}
                onClick={() => run('PUBLISH')}
              >
                공개
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={bulk.isPending}
                onClick={() => run('PRIVATE')}
              >
                비공개
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={bulk.isPending}
                onClick={() => run('TRASH')}
              >
                휴지통으로
              </Button>
            </>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {data && (
          <div className="flex items-center gap-3 border-b border-slate-100 p-3 text-sm text-slate-500">
            {canEdit && items.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  disabled={postsQuery.isPlaceholderData}
                  onChange={() => setSelected(allChecked ? [] : items.map((post) => post.id))}
                />
                이 페이지 전체 선택
              </label>
            )}
            <span className="ml-auto">총 {data.total.toLocaleString()}개</span>
          </div>
        )}
        {postsQuery.isLoading && <div className="h-40 animate-pulse bg-slate-50" />}
        {postsQuery.isError && (
          <p className="p-6 text-sm text-red-600">글을 불러오지 못했습니다.</p>
        )}
        {data && items.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            {inTrash ? '휴지통이 비어 있습니다.' : '조건에 맞는 글이 없습니다.'}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {items.map((post) => (
            <li key={post.id} className="flex items-center gap-3 p-4">
              {canEdit && (
                <input
                  type="checkbox"
                  aria-label={`${post.title} 선택`}
                  checked={selected.includes(post.id)}
                  disabled={postsQuery.isPlaceholderData}
                  onChange={() => toggle(post.id)}
                />
              )}
              <div className="min-w-0 flex-1">
                {inTrash ? (
                  <p className="truncate font-medium text-slate-900">{post.title}</p>
                ) : (
                  <Link
                    to={`/admin/boards/${post.board_id}/posts/${post.id}/edit`}
                    className="block truncate font-medium text-slate-900 hover:underline"
                  >
                    {post.title}
                  </Link>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{post.board_name}</span>
                  {!inTrash && (
                    <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[post.status]}`}>
                      {STATUS_LABELS[post.status]}
                    </span>
                  )}
                  {post.guest_name && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                      비회원 · {post.guest_name}
                    </span>
                  )}
                  {post.author_member_id && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                      회원 작성{post.author_member_name ? ` · ${post.author_member_name}` : ''}
                    </span>
                  )}
                  <time dateTime={post.updated_at}>
                    수정 {dayjs(post.updated_at).format('YYYY.MM.DD')}
                  </time>
                </div>
                {Object.values(post.custom_data ?? {}).some((value) => !isEmptyValue(value)) && (
                  <PostListFields boardId={post.board_id} values={post.custom_data ?? {}} />
                )}
              </div>
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
              onClick={() => changeFilters({ page: page - 1 })}
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
              onClick={() => changeFilters({ page: page + 1 })}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
