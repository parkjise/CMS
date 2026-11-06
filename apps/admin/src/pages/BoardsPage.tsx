import { useEffect } from 'react'
import dayjs from 'dayjs'
import { Copy, ExternalLink, FileText, Plus, Settings, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { Board } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useBoardLimits, useBoards, useDeleteBoard, useDuplicateBoard } from '@/hooks/useBoards'
import { useSiteMenu } from '@/hooks/useSiteSettings'
import { BOARD_TYPES, boardTypeLabel } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = (import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  ''
)

/** 게시판 목록 (BM-01, 게시판 모듈 기획서 4장) */
export function BoardsPage() {
  const boardsQuery = useBoards()
  const limitsQuery = useBoardLimits()
  const mode = useSiteMenu().data?.mode
  const isTheme = mode === 'theme'
  const tenantSlug = useAuthStore((state) => state.tenantSlug)
  const canEdit = useCanEdit()
  const boards = boardsQuery.data
  const limits = limitsQuery.data
  const duplicateBoard = useDuplicateBoard()
  const deleteBoard = useDeleteBoard()
  const actionPending = duplicateBoard.isPending || deleteBoard.isPending
  const canDuplicate = Boolean(limits?.can_create) && !limitsQuery.isError
  const navigate = useNavigate()
  const duplicate = async (id: string) => {
    if (!canEdit || actionPending || !canDuplicate) return
    try {
      const copy = await duplicateBoard.mutateAsync(id)
      toast.success('설정과 칸을 복제했습니다. 글은 복제되지 않습니다.')
      navigate(`/admin/boards/${copy.id}/settings`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '복제하지 못했습니다.'))
    }
  }
  const remove = async (board: Board) => {
    if (!canEdit || actionPending || board.system_key !== null) return
    const posts =
      board.post_count > 0
        ? `글 ${board.post_count.toLocaleString()}개도 함께 보이지 않게 되고, `
        : ''
    if (
      !window.confirm(
        `'${board.name}' 을(를) 휴지통으로 옮길까요? ${posts}홈페이지 메뉴와 주소에서 빠집니다.`
      )
    )
      return
    try {
      await deleteBoard.mutateAsync(board.id)
      toast.success('휴지통으로 옮겼습니다.')
    } catch (error) {
      toast.error(pickErrorMessage(error, '삭제하지 못했습니다.'))
    }
  }
  const [searchParams, setSearchParams] = useSearchParams()
  const nameQuery = searchParams.get('q') ?? ''
  const typeQuery = searchParams.get('type') ?? ''
  const statusQuery = searchParams.get('status') ?? ''
  const selectedType = BOARD_TYPES.some((type) => type.value === typeQuery) ? typeQuery : ''
  const selectedStatus = ['ACTIVE', 'INACTIVE'].includes(statusQuery) ? statusQuery : ''
  const filteredBoards = boards?.filter(
    (board) =>
      board.name.toLocaleLowerCase().includes(nameQuery.trim().toLocaleLowerCase()) &&
      (!selectedType || board.board_type === selectedType) &&
      (!selectedStatus || board.status === selectedStatus)
  )
  const updateFilter = (key: string, value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true }
    )
  }
  const resetFilters = () => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const key of ['q', 'type', 'status']) next.delete(key)
        return next
      },
      { replace: true }
    )
  }
  // 홈페이지의 [글쓰기] → ?write=notice, 글 상세의 [수정] → ?write=notice&post={글 id}
  const writeKey = searchParams.get('write')
  const postKey = searchParams.get('post')

  useEffect(() => {
    const target = boards?.find((b) => b.slug === writeKey)
    if (!target) return
    const screen = postKey ? `${encodeURIComponent(postKey)}/edit` : 'new'
    navigate(`/admin/boards/${target.id}/posts/${screen}`, { replace: true })
  }, [boards, writeKey, postKey, navigate])

  return (
    <div className="space-y-5 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">게시판 관리</h1>
          <p className="mt-1 text-sm text-slate-500">홈페이지에 보이는 게시판의 글을 관리하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/posts"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100"
          >
            <FileText className="h-4 w-4" aria-hidden />
            전체 글
          </Link>
          <Link
            to="/admin/boards/trash"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            휴지통
          </Link>
          {canEdit && limits?.can_create && (
            <Link
              to="/admin/boards/new"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              게시판 추가
            </Link>
          )}
        </div>
      </div>

      {canEdit && limits && !limits.can_create && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {limits.reason}{' '}
          <Link to="/admin/billing" className="font-medium text-blue-600 underline">
            요금제 보기
          </Link>
        </p>
      )}

      {canEdit && limitsQuery.isError && (
        <p role="alert" className="text-sm text-red-600">
          게시판 한도를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="min-w-48 flex-1 text-sm text-slate-600">
          게시판 이름
          <input
            type="search"
            value={nameQuery}
            onChange={(event) => updateFilter('q', event.target.value)}
            placeholder="게시판 이름 검색"
            className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 text-slate-900"
          />
        </label>
        <label className="text-sm text-slate-600">
          게시판 유형
          <select
            value={selectedType}
            onChange={(event) => updateFilter('type', event.target.value)}
            className="mt-1 block h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-900"
          >
            <option value="">전체 유형</option>
            {BOARD_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          사용 상태
          <select
            value={selectedStatus}
            onChange={(event) => updateFilter('status', event.target.value)}
            className="mt-1 block h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-900"
          >
            <option value="">전체 상태</option>
            <option value="ACTIVE">사용 중</option>
            <option value="INACTIVE">사용 안 함</option>
          </select>
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="h-10 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100"
        >
          검색 초기화
        </button>
      </div>
      {!boardsQuery.isError && boards && (
        <p role="status" className="text-sm text-slate-500">
          전체 {boards.length}개 중 {filteredBoards?.length ?? 0}개
        </p>
      )}

      {boardsQuery.isLoading && (
        <div className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boards?.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          아직 게시판이 없습니다.
        </p>
      )}

      {boards && boards.length > 0 && filteredBoards?.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          검색 조건에 맞는 게시판이 없습니다.
        </p>
      )}
      {filteredBoards && filteredBoards.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
          {filteredBoards.map((board) => {
            const path = board.system_key
              ? encodeURIComponent(board.system_key)
              : `b/${encodeURIComponent(board.slug)}`
            const url = tenantSlug
              ? `${CLIENT_BASE_URL}/${encodeURIComponent(tenantSlug)}/${path}`
              : null
            const canOpen =
              url && board.status === 'ACTIVE' && (!board.system_key || mode === 'code')
            const modified = board.updated_at ? dayjs(board.updated_at) : null
            return (
              <li
                key={board.id}
                className="flex flex-wrap items-center gap-2 pr-2 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <Link
                    to={`/admin/boards/${board.id}/posts`}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{board.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {boardTypeLabel(board.board_type)}
                      </span>
                      {isTheme && board.system_key !== null && (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                          지금 템플릿에는 표시되지 않습니다
                        </span>
                      )}
                      {board.status === 'INACTIVE' && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          사용 안 함
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-slate-500">
                      글 {board.post_count.toLocaleString()}개
                    </span>
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-xs text-slate-500">
                    {url ? (
                      canOpen ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${board.name} 홈페이지 (새 창)`}
                          className="inline-flex min-w-0 items-start gap-1 break-all text-blue-600 hover:underline"
                        >
                          <span className="break-all">{url}</span>
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        </a>
                      ) : (
                        <span className="break-all">주소 {url}</span>
                      )
                    ) : (
                      <span>홈페이지 주소 확인 불가</span>
                    )}
                    {modified?.isValid() ? (
                      <time dateTime={board.updated_at} title="게시판 설정 수정일">
                        설정 수정 {modified.format('YYYY.MM.DD HH:mm')}
                      </time>
                    ) : (
                      <span>설정 수정일 확인 불가</span>
                    )}
                  </div>
                </div>
                <div
                  role="group"
                  aria-label={`${board.name} 작업`}
                  className="ml-auto flex flex-wrap items-center gap-1 p-2"
                >
                  {canEdit && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`${board.name} 복제`}
                        title={
                          canDuplicate
                            ? '설정과 칸만 복제합니다. 글은 복제하지 않습니다.'
                            : (limits?.reason ?? '게시판 한도를 확인한 뒤 복제할 수 있습니다.')
                        }
                        disabled={actionPending || !canDuplicate}
                        loading={duplicateBoard.isPending && duplicateBoard.variables === board.id}
                        onClick={() => void duplicate(board.id)}
                      >
                        <Copy className="h-4 w-4" aria-hidden />
                        복제
                      </Button>
                      {board.system_key === null && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`${board.name} 휴지통으로`}
                          disabled={actionPending}
                          loading={deleteBoard.isPending && deleteBoard.variables === board.id}
                          onClick={() => void remove(board)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          휴지통으로
                        </Button>
                      )}
                    </>
                  )}
                  <Link
                    to={`/admin/boards/${board.id}/settings`}
                    aria-label={`${board.name} 설정`}
                    className="rounded p-2 text-slate-500 hover:bg-slate-100"
                  >
                    <Settings className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
