import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { useBoards } from '@/hooks/useBoards'

interface BoardDetailHeaderProps {
  boardId: string
  /** 제목 오른쪽 버튼 */
  actions?: ReactNode
}

/** 게시판 상세 위쪽 — 이름과 탭. 기능이 있는 탭만 연다 (게시판 모듈 기획서 4장) */
export function BoardDetailHeader({ boardId, actions }: BoardDetailHeaderProps) {
  const board = useBoards().data?.find((b) => b.id === boardId)
  const tabs = [
    { to: 'posts', label: '글 관리' },
    { to: 'settings', label: '기본 정보' },
    { to: 'connection', label: '홈페이지 연결' },
    // 기본 게시판에는 칸을 추가할 수 없다
    ...(board?.system_key ? [] : [{ to: 'fields', label: '필드 관리' }]),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/boards" className="text-sm text-slate-500 hover:text-slate-700">
            ← 게시판 관리
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{board?.name ?? '게시판'}</h1>
        </div>
        {actions}
      </div>
      <nav aria-label="게시판 상세" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ to, label }) => (
          <NavLink
            key={to}
            to={`/admin/boards/${boardId}/${to}`}
            className={({ isActive }) =>
              [
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                isActive
                  ? 'border-blue-600 text-blue-700'
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
