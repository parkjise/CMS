import { Link } from 'react-router'
import { BOARD_EXAMPLES } from '@/lib/boardExamples'
import { boardTypeLabel } from '@/lib/boardLabels'

interface BoardExamplesProps {
  canCreate: boolean
}

export function BoardExamples({ canCreate }: BoardExamplesProps) {
  return (
    <section
      aria-labelledby="board-examples-title"
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <div>
        <h2 id="board-examples-title" className="font-semibold text-slate-900">
          이런 게시판으로 시작해 보세요
        </h2>
        <p className="mt-1 text-sm text-slate-600">용도에 맞는 게시판 이름과 모양을 살펴보세요.</p>
        {canCreate && (
          <p className="mt-1 text-sm text-slate-500">
            예시를 고르면 다음 화면에서 바꿀 수 있습니다. 만들기를 눌러야 저장됩니다.
          </p>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {BOARD_EXAMPLES.map((example) => (
          <li
            key={example.id}
            className="space-y-2 rounded-md border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-slate-900">{example.name}</h3>
              <span className="text-xs text-slate-500">{boardTypeLabel(example.board_type)}</span>
            </div>
            <p className="text-sm text-slate-600">{example.description}</p>
            {canCreate && (
              <Link
                to={`/admin/boards/new?example=${example.id}`}
                aria-label={`${example.name} 예시로 시작`}
                className="inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                예시로 시작 →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
