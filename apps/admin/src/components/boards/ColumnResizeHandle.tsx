import { useRef } from 'react'
import { clampColumnWidth } from '@/stores/postTableLayoutStore'

const KEY_STEP = 16

interface ColumnResizeHandleProps {
  /** 열 이름 — "메모 열 넓이" */
  label: string
  /** 지금 넓이 px — 끌기 시작점 · 키보드 기준 */
  width: number
  /** 끄는 동안 화면에만 */
  onPreview: (px: number) => void
  /** 놓거나 키로 바꾸면 저장 */
  onCommit: (px: number) => void
  /** 두 번 누르면 원래 크기로 */
  onReset: () => void
}

/**
 * 열 제목 오른쪽 경계 — 끌어서 넓이 조절 (T-215, 1113 #11).
 * 키보드: 포커스 후 ← / → 16px, 더블클릭은 원래 크기.
 */
export function ColumnResizeHandle({
  label,
  width,
  onPreview,
  onCommit,
  onReset,
}: ColumnResizeHandleProps) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} 열 넓이`}
      aria-valuenow={width}
      aria-valuemin={96}
      aria-valuemax={640}
      tabIndex={0}
      title="끌어서 넓이 조절 · 두 번 누르면 원래 크기"
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none hover:bg-blue-400/40 focus-visible:bg-blue-500/60 focus-visible:outline-none"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        // 화면에 실제로 그려진 넓이에서 시작 — 내용 때문에 기본 넓이보다 넓을 수 있다
        const shown = e.currentTarget.parentElement?.getBoundingClientRect().width
        const start = shown ? clampColumnWidth(shown) : width
        drag.current = { x: e.clientX, width: start, last: start }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const next = clampColumnWidth(drag.current.width + e.clientX - drag.current.x)
        drag.current.last = next
        onPreview(next)
      }}
      onPointerUp={() => {
        if (!drag.current) return
        const { last, width: start } = drag.current
        drag.current = null
        if (last !== start) onCommit(last)
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        onCommit(clampColumnWidth(width + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP)))
      }}
    />
  )
}
