import type { BoardField } from '@cms/types'
import { Button } from '@cms/ui'
import {
  type PostTableLayout,
  isColumnSize,
  tableColumnSize,
  usePostTableLayoutStore,
} from '@/stores/postTableLayoutStore'

interface PostTableLayoutControlsProps {
  scope: string | null
  fields: BoardField[]
  layout?: PostTableLayout
  /** 화면 · 이 브라우저에 바로, 계정(서버)에는 잠시 뒤 저장한다 (T-181) */
  onSave: (layout: PostTableLayout | null) => void
  /** 계정(서버)에 저장하지 못했다 */
  serverFailed: boolean
  onRetryServer: () => void
}

export const PostTableLayoutControls = ({
  scope,
  fields,
  layout,
  onSave,
  serverFailed,
  onRetryServer,
}: PostTableLayoutControlsProps) => {
  const save = usePostTableLayoutStore((state) => state.save)
  const failed = usePostTableLayoutStore((state) => (scope ? state.saveFailed[scope] : false))
  const current = (): PostTableLayout => ({
    order: fields.map((field) => field.id),
    sizes: Object.fromEntries(fields.map((field) => [field.id, tableColumnSize(layout, field.id)])),
  })
  const move = (index: number, direction: number) => {
    if (!scope) return
    const next = current()
    const target = index + direction
    if (target < 0 || target >= next.order.length) return
    ;[next.order[index], next.order[target]] = [next.order[target], next.order[index]]
    onSave(next)
  }
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">열 순서·크기</summary>
      <p className="mt-3 text-xs text-slate-500">
        지금 계정의 이 게시판 설정으로 저장되어 다른 브라우저 · 기기에서도 같게 보입니다. 크기는
        열의 최소 너비입니다. 제목 아래 보기와 홈페이지에는 적용되지 않습니다.
      </p>
      {!scope ? (
        <p className="mt-2 text-sm text-slate-500">
          계정 정보를 확인한 뒤 열 설정을 사용할 수 있습니다.
        </p>
      ) : (
        <>
          <ol className="mt-3 space-y-2">
            {fields.map((field, index) => (
              <li
                key={field.id}
                className="flex flex-wrap items-center gap-2 rounded border border-slate-100 p-2"
              >
                <span className="min-w-0 flex-1 basis-32 break-words">
                  {index + 1}. {field.label}
                </span>
                <select
                  aria-label={`${field.label} 열 크기`}
                  className="h-9 rounded border border-slate-300 bg-white px-2"
                  value={tableColumnSize(layout, field.id)}
                  onChange={(event) => {
                    const size = event.target.value
                    if (!isColumnSize(size)) return
                    const next = current()
                    next.sizes[field.id] = size
                    onSave(next)
                  }}
                >
                  <option value="narrow">좁게</option>
                  <option value="normal">보통</option>
                  <option value="wide">넓게</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`${field.label} 열 앞으로`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  앞으로
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`${field.label} 열 뒤로`}
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
            className="mt-3"
            size="sm"
            variant="secondary"
            disabled={!layout}
            onClick={() => onSave(null)}
          >
            열 설정 초기화
          </Button>
          {failed && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              이 브라우저에 저장하지 못했습니다. 현재 화면에만 적용됩니다.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => save(scope, layout ? current() : null)}
              >
                저장 다시 시도
              </button>
            </p>
          )}
          {serverFailed && (
            <p role="alert" className="mt-3 text-sm text-amber-700">
              계정에 저장하지 못했습니다. 이 브라우저에서는 지금 설정이 유지됩니다.{' '}
              <button type="button" className="underline" onClick={onRetryServer}>
                계정에 다시 저장
              </button>
            </p>
          )}
        </>
      )}
    </details>
  )
}
