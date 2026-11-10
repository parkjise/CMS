import { useEffect, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useBoards } from '@/hooks/useBoards'
import {
  BOARD_SECTION_HELP,
  BOARD_SECTION_TITLES,
  CUSTOM_ONLY_SECTIONS,
  saveBoardContext,
} from '@/lib/boardWorkspace'
import { BoardPageTitle } from './BoardPageTitle'
import { TAG_GREEN, TAG_OFF } from './boardStyles'

interface BoardDetailHeaderProps {
  boardId: string
  /** 제목 오른쪽 버튼 */
  actions?: ReactNode
}

/** 게시판 상세 위쪽 — 화면 제목, 작업 중인 게시판 고르기, 탭. 기능이 있는 탭만 연다 (게시판 모듈 기획서 4장, T-187) */
export function BoardDetailHeader({ boardId, actions }: BoardDetailHeaderProps) {
  const boards = useBoards().data ?? []
  const board = boards.find((b) => b.id === boardId)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const section = pathname.split('/').at(-1) ?? 'settings'
  // 기본 게시판에 없는 화면이면 고를 수 있는 게시판도 새 게시판만
  const choices = CUSTOM_ONLY_SECTIONS.includes(section)
    ? boards.filter((item) => !item.system_key)
    : boards

  useEffect(() => {
    if (board) saveBoardContext(board.id)
  }, [board])

  const tabs = [
    { to: 'posts', label: '글 관리' },
    { to: 'settings', label: '기본 정보' },
    // 기본 게시판에는 칸 · 카테고리를 만들 수 없다
    ...(board?.system_key
      ? []
      : [
          { to: 'fields', label: '필드 관리' },
          { to: 'categories', label: '카테고리' },
        ]),
    { to: 'design', label: '게시판 디자인' },
    ...(board?.system_key
      ? []
      : [
          { to: 'permissions', label: '권한' },
          { to: 'operation', label: '운영 설정' },
        ]),
    { to: 'connection', label: '홈페이지 연결' },
  ]

  return (
    <div className="space-y-5">
      <BoardPageTitle
        title={BOARD_SECTION_TITLES[section] ?? board?.name ?? '게시판'}
        description={BOARD_SECTION_HELP[section] ?? '게시판의 정보와 운영 설정을 관리하세요.'}
        actions={actions}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm">
        <label htmlFor="board-context-select" className="text-slate-500">
          작업 중인 게시판
        </label>
        <select
          id="board-context-select"
          value={boardId}
          onChange={(event) => navigate(`/admin/boards/${event.target.value}/${section}`)}
          className="h-9 min-w-44 rounded-lg border-0 bg-slate-50 px-3 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {!choices.some((item) => item.id === boardId) && (
            <option value={boardId}>{board?.name ?? '게시판 선택'}</option>
          )}
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {board && <span className="font-mono text-xs text-slate-400">{board.slug}</span>}
        {board && (
          <span className={`ml-auto ${board.status === 'ACTIVE' ? TAG_GREEN : TAG_OFF}`}>
            {board.status === 'ACTIVE' ? '운영 중' : '비활성'}
          </span>
        )}
      </div>
      <nav
        aria-label="게시판 상세"
        className="flex gap-4 overflow-x-auto border-b border-slate-200"
      >
        {tabs.map(({ to, label }) => (
          <NavLink
            key={to}
            to={`/admin/boards/${boardId}/${to}`}
            className={({ isActive }) =>
              [
                '-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-sm',
                isActive
                  ? 'border-blue-600 font-semibold text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
