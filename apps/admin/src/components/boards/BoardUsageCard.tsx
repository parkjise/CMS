import { Link } from 'react-router'
import { useBoardUsage } from '@/hooks/useBoards'

interface BoardUsageCardProps {
  boardId: string
}

/**
 * 사용 위치 (T-243, 페이지 기획서 CM-01) — 어느 페이지의 어느 섹션이 이 게시판을 보여 주는지.
 * 섹션 이름을 누르면 그 섹션 편집으로.
 */
export function BoardUsageCard({ boardId }: BoardUsageCardProps) {
  const { data: usage, isPending, isError } = useBoardUsage(boardId)

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">사용 위치</h3>
        <p className="mt-1 text-xs text-slate-500">
          페이지 관리의 &lsquo;게시판 연결&rsquo; 섹션으로 이 게시판 글을 보여 주는 곳이에요.
        </p>
      </div>
      {isPending ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : isError ? (
        <p className="text-sm text-slate-500">사용 위치를 불러오지 못했습니다.</p>
      ) : !usage.length ? (
        <p className="text-sm text-slate-500">
          아직 이 게시판을 보여 주는 섹션이 없어요. 페이지 관리에서 &lsquo;게시판 연결&rsquo;
          섹션을 추가해 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {usage.map((u) => (
            <li key={u.section_id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="text-slate-500">{u.page_title}</span>
                <span className="mx-1.5 text-slate-300" aria-hidden>
                  ›
                </span>
                <Link
                  to={`/admin/pages/${u.page_key}/sections/${u.section_id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {u.label}
                </Link>
              </span>
              {!u.is_active && (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                  숨김
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
