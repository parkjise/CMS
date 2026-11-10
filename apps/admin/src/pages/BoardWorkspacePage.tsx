import { Link, Navigate, useLocation } from 'react-router'
import { useBoards } from '@/hooks/useBoards'
import {
  BOARD_SECTION_HELP,
  BOARD_SECTION_TITLES,
  CUSTOM_ONLY_SECTIONS,
  readBoardContext,
  type BoardSection,
} from '@/lib/boardWorkspace'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { CARD, LINK_PRIMARY, PAGE } from '@/components/boards/boardStyles'

/** 하위 메뉴(디자인 · 필드 등)는 마지막으로 작업한 게시판의 그 화면으로 보낸다 (T-187) */
export function BoardWorkspacePage() {
  const section = useLocation().pathname.split('/').at(-1) as BoardSection
  const query = useBoards()
  const boards =
    query.data?.filter((board) => !CUSTOM_ONLY_SECTIONS.includes(section) || !board.system_key) ??
    []
  const previous = readBoardContext()
  const board = boards.find((item) => item.id === previous) ?? boards[0]
  if (board) return <Navigate to={`/admin/boards/${board.id}/${section}`} replace />

  return (
    <div className={PAGE}>
      <BoardPageTitle
        title={BOARD_SECTION_TITLES[section]}
        description={BOARD_SECTION_HELP[section]}
      />
      {query.isLoading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" />}
      {query.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {query.isSuccess && (
        <div className={`${CARD} py-14 text-center`}>
          <h2 className="text-base font-semibold text-slate-800">설정할 게시판이 없습니다.</h2>
          <p className="mt-2 text-sm text-slate-500">
            {CUSTOM_ONLY_SECTIONS.includes(section)
              ? '이 설정은 새로 만든 게시판에서 쓸 수 있어요.'
              : '게시판 목록에서 사용할 게시판을 확인해 주세요.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/admin/boards" className={LINK_PRIMARY}>
              게시판 목록
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
