import type { BoardColumnLayout } from '@cms/types'
import { Button } from '@cms/ui'
import { useBoardFields } from '@/hooks/useBoardFields'

interface PublicColumnLayoutSettingsProps {
  boardId: string
  layout: BoardColumnLayout[]
  onChange: (layout: BoardColumnLayout[]) => void
}

/** 디자인 폼의 저장 버튼으로 홈페이지 공통 설정을 저장한다. */
export const PublicColumnLayoutSettings = ({
  boardId,
  layout,
  onChange,
}: PublicColumnLayoutSettingsProps) => {
  const query = useBoardFields(boardId)
  const positions = new Map(layout.map((column, index) => [column.key, index]))
  const fields = (query.data ?? [])
    .filter(
      (field) =>
        field.board_id === boardId && !field.deleted_at && field.is_visible && field.show_in_list
    )
    .sort((a, b) => a.display_order - b.display_order)
    .sort(
      (a, b) =>
        (positions.get(a.field_key) ?? layout.length) -
        (positions.get(b.field_key) ?? layout.length)
    )
  const current = (): BoardColumnLayout[] =>
    fields.map((field) => ({
      key: field.field_key,
      size: layout.find((column) => column.key === field.field_key)?.size ?? 'normal',
    }))
  const move = (index: number, direction: number) => {
    const next = current()
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">홈페이지 표 열 순서·크기</h2>
      <p className="text-xs text-slate-500">
        저장하면 모든 방문자에게 적용됩니다. 제목·작성일 열은 고정이며, 크기는 최소 너비입니다. 새로
        표시하는 칸은 뒤에 붙습니다.
      </p>
      {query.isPending ? (
        <p className="text-sm">표시할 칸을 불러오는 중…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-red-600">
          표시할 칸을 불러오지 못했습니다.{' '}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            다시 불러오기
          </button>
        </p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-slate-500">
          홈페이지 표시와 목록 표시를 켠 칸이 없습니다. 아래에서 표시할 칸을 선택해 주세요.
        </p>
      ) : (
        <>
          <ol className="space-y-2">
            {fields.map((field, index) => (
              <li
                key={field.id}
                className="flex flex-wrap items-center gap-2 rounded border border-slate-100 p-2"
              >
                <span className="min-w-0 flex-1 basis-32 break-words">
                  {index + 1}. {field.label}
                </span>
                <select
                  aria-label={`${field.label} 홈페이지 열 크기`}
                  className="h-9 rounded border border-slate-300 bg-white px-2"
                  value={current()[index].size}
                  onChange={(event) => {
                    const size = event.target.value
                    if (size !== 'narrow' && size !== 'normal' && size !== 'wide') return
                    const next = current()
                    next[index].size = size
                    onChange(next)
                  }}
                >
                  <option value="narrow">좁게 (128px)</option>
                  <option value="normal">보통 (160px)</option>
                  <option value="wide">넓게 (256px)</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`${field.label} 홈페이지 열 앞으로`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  앞으로
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`${field.label} 홈페이지 열 뒤로`}
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  뒤로
                </Button>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!layout.length}
            onClick={() => onChange([])}
          >
            홈페이지 열 설정 초기화
          </Button>
        </>
      )}
    </section>
  )
}
