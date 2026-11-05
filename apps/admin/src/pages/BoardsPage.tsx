import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useBoards } from '@/hooks/useBoards'

/** 게시판 목록 (BM-01) — 1단계는 템플릿 기본 게시판만 (게시판 모듈 기획서 4장) */
export function BoardsPage() {
  const boardsQuery = useBoards()
  const boards = boardsQuery.data
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 홈페이지 공지 페이지의 [글쓰기] → ?write=notice
  const writeKey = searchParams.get('write')

  useEffect(() => {
    const target = boards?.find((b) => b.slug === writeKey)
    if (target) navigate(`/admin/boards/${target.id}/posts/new`, { replace: true })
  }, [boards, writeKey, navigate])

  return (
    <div className="space-y-5 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">게시판 관리</h1>
        <p className="mt-1 text-sm text-slate-500">홈페이지에 보이는 게시판의 글을 관리하세요.</p>
      </div>

      {boardsQuery.isLoading && (
        <div className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && (
        <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>
      )}
      {boards?.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          지금 쓰는 템플릿에는 아직 게시판이 없습니다.
        </p>
      )}

      {boards && boards.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                to={`/admin/boards/${board.id}/posts`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{board.name}</span>
                <span className="text-sm text-slate-500">글 {board.post_count.toLocaleString()}개</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
