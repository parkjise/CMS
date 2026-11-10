import { useBoards } from '@/hooks/useBoards'
import { COUNTS, type LatestValue, pickableBoard } from './latestBoard'

interface LatestBoardFieldsProps {
  value: LatestValue
  onChange: (value: LatestValue) => void
  /** 게시판을 고르지 않았을 때 — 테마형은 숨김, 코드형은 공지 */
  emptyLabel: string
  /** 개수를 고르지 않았을 때 */
  defaultCount: number
  /** 글이 없을 때 홈페이지에 무엇이 보이는지 */
  hint: string
}

export function LatestBoardFields({
  value,
  onChange,
  emptyLabel,
  defaultCount,
  hint,
}: LatestBoardFieldsProps) {
  const { data: boards = [], isPending } = useBoards()
  const options = boards.filter(pickableBoard)
  // 지웠거나 회원 전용이 된 게시판 — 저장된 값을 그대로 두되 다시 고르라고 알린다
  const missing = value.board !== '' && !isPending && !options.some((b) => b.id === value.board)

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">보여 줄 게시판</span>
        <select
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={missing ? '' : value.board}
          disabled={isPending}
          onChange={(e) => onChange({ ...value, board: e.target.value })}
        >
          <option value="">{emptyLabel}</option>
          {options.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
              {board.status === 'INACTIVE' ? ' (비활성)' : ''}
            </option>
          ))}
        </select>
      </label>
      {missing && (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800" role="alert">
          고른 게시판을 찾을 수 없습니다. 게시판을 다시 골라 주세요.
        </p>
      )}
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-slate-700">글 개수</span>
        <select
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={value.count || String(defaultCount)}
          onChange={(e) => onChange({ ...value, count: e.target.value })}
        >
          {COUNTS.map((n) => (
            <option key={n} value={String(n)}>
              {n}개
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  )
}
