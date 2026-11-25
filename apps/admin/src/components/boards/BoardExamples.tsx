import { Link } from 'react-router'
import { useBoardContentPresets, useBoardTypeOptions } from '@/hooks/useBoards'
import { BOARD_EXAMPLES } from '@/lib/boardExamples'
import { boardTypeLabel } from '@/lib/boardLabels'

interface BoardExamplesProps {
  canCreate: boolean
}

const START_LINK =
  'inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-blue-600 hover:bg-blue-50'

export function BoardExamples({ canCreate }: BoardExamplesProps) {
  // 콘텐츠형 게시판 (T-243) — 페이지의 '게시판 연결' 섹션으로 보여 준다
  const contentPresets = useBoardContentPresets().data ?? []
  const blockedTypes = useBoardTypeOptions().data?.blocked ?? {}

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
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                className={START_LINK}
              >
                예시로 시작 →
              </Link>
            )}
          </li>
        ))}
      </ul>
      {contentPresets.length > 0 && (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div>
            <h3 className="font-semibold text-slate-900">콘텐츠형 게시판</h3>
            <p className="mt-1 text-sm text-slate-600">
              서비스 · 연혁 · 팀 소개처럼 페이지에 보여 줄 내용을 글로 관리해요. 방문자 글쓰기 없이
              페이지의 &lsquo;게시판 연결&rsquo; 섹션으로 보여 줍니다.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {contentPresets.map((preset) => {
              const blocked = blockedTypes[preset.board_type]
              return (
                <li
                  key={preset.key}
                  className="space-y-2 rounded-md border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-slate-900">{preset.name}</h4>
                    <span className="text-xs text-slate-500">
                      {boardTypeLabel(preset.board_type)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{preset.description}</p>
                  {blocked ? (
                    <p className="text-xs text-amber-700">{blocked}</p>
                  ) : (
                    canCreate && (
                      <Link
                        to={`/admin/boards/new?content=${preset.key}`}
                        aria-label={`${preset.name} 콘텐츠형으로 시작`}
                        className={START_LINK}
                      >
                        이걸로 시작 →
                      </Link>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
