import { useEffect } from 'react'
import { FileText, Plus, Settings, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useBoardLimits, useBoards } from '@/hooks/useBoards'
import { useSiteMenu } from '@/hooks/useSiteSettings'
import { NOT_SHOWN_YET, boardTypeLabel } from '@/lib/boardLabels'

/** 게시판 목록 (BM-01, 게시판 모듈 기획서 4장) */
export function BoardsPage() {
  const boardsQuery = useBoards()
  const limitsQuery = useBoardLimits()
  const isTheme = useSiteMenu().data?.mode === 'theme'
  const canEdit = useCanEdit()
  const boards = boardsQuery.data
  const limits = limitsQuery.data
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 홈페이지 공지 페이지의 [글쓰기] → ?write=notice
  const writeKey = searchParams.get('write')

  useEffect(() => {
    const target = boards?.find((b) => b.slug === writeKey)
    if (target) navigate(`/admin/boards/${target.id}/posts/new`, { replace: true })
  }, [boards, writeKey, navigate])

  const hasCustomBoard = boards?.some((b) => b.system_key === null)

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
      {hasCustomBoard && isTheme && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{NOT_SHOWN_YET}</p>
      )}

      {boardsQuery.isLoading && (
        <div className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && (
        <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>
      )}
      {boards?.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          아직 게시판이 없습니다.
        </p>
      )}

      {boards && boards.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
          {boards.map((board) => (
            <li key={board.id} className="flex items-center gap-2 pr-2 hover:bg-slate-50">
              <Link
                to={`/admin/boards/${board.id}/posts`}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 p-4"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{board.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{boardTypeLabel(board.board_type)}</span>
                  {board.status === 'INACTIVE' && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">사용 안 함</span>
                  )}
                </span>
                <span className="text-sm text-slate-500">글 {board.post_count.toLocaleString()}개</span>
              </Link>
              <Link
                to={`/admin/boards/${board.id}/settings`}
                aria-label={`${board.name} 설정`}
                className="rounded p-2 text-slate-500 hover:bg-slate-100"
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
