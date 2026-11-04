'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCw, Sparkles, X } from 'lucide-react'
import { useCopySuggest } from '@/hooks/useCopySuggest'
import { featureOn, useClientAuthStore } from '@/lib/authStore'

interface Props {
  sectionId: string
  field: string
  /** 현재 문구 (API에 개선 기준으로 전달) */
  currentValue: string
  /** 추천 문구 적용 시 호출 */
  onApply: (value: string) => void
}

const SECTION_TYPE_SELECTOR = '[data-section-type]'
const POPOVER_WIDTH = 288
const SCREEN_MARGIN = 8

/**
 * 추천 창이 화면 밖으로 나가지 않게 버튼 오른쪽 끝에서 옮길 거리(px) — 음수면 오른쪽으로 (T-125-H)
 * 버튼이 글자 옆으로 오면서 왼쪽 정렬 글자에서는 창이 왼쪽으로 잘릴 수 있다
 */
export const popoverShift = (anchorRight: number, viewportWidth: number): number => {
  const width = Math.min(POPOVER_WIDTH, viewportWidth - SCREEN_MARGIN * 2)
  const overRight = anchorRight - (viewportWidth - SCREEN_MARGIN)
  if (overRight > 0) return overRight
  return Math.min(0, anchorRight - width - SCREEN_MARGIN)
}

export function CopySuggestPopover({ field, currentValue, onApply }: Props) {
  const enabled = useClientAuthStore(featureOn('AI_COPY_SUGGEST'))
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const { suggestions, isLoading, error, generate, reset } = useCopySuggest()

  const resolveSectionType = useCallback((): string => {
    const el = rootRef.current?.closest(SECTION_TYPE_SELECTOR)
    return (el?.getAttribute('data-section-type') as string) || 'GENERAL'
  }, [])

  const runGenerate = useCallback(() => {
    void generate({
      section_type: resolveSectionType(),
      field,
      current_value: currentValue,
    })
  }, [generate, resolveSectionType, field, currentValue])

  // 팝오버 열릴 때 자동 1회 생성
  useEffect(() => {
    if (open && suggestions.length === 0 && !isLoading && !error) {
      runGenerate()
    }
  }, [open, suggestions.length, isLoading, error, runGenerate])

  // 바깥 클릭 / Escape 로 닫기
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const root = rootRef.current
    if (!open && root) {
      const shift = popoverShift(root.getBoundingClientRect().right, window.innerWidth)
      root.style.setProperty('--popover-shift', `${shift}px`)
    }
    setOpen((prev) => {
      const next = !prev
      if (!next) reset()
      return next
    })
  }

  const handleApply = (value: string) => {
    onApply(value)
    setOpen(false)
    reset()
  }

  if (!enabled) return null

  return (
    <div
      ref={rootRef}
      className={`ai-copy-suggest absolute top-[var(--edit-text-top,-0.5rem)] right-[var(--edit-text-end,0px)] ${open ? 'z-[60]' : 'z-50'}`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label="AI 문구 추천"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-[var(--border-radius-pill)] bg-[var(--color-primary)] px-2 py-1 text-[11px] font-medium text-[color:var(--color-on-primary)] shadow-sm transition hover:bg-[var(--color-primary-hover)]"
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        <span>AI 추천</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="AI 문구 추천"
          className="absolute right-[var(--popover-shift,0px)] top-full mt-1 w-72 max-w-[calc(100vw-16px)] rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] bg-[var(--color-background)] p-3 text-left shadow-[var(--shadow-floating)]"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[color:var(--color-text-primary)]">
              AI 추천 문구
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {isLoading && (
            <div
              className="flex items-center gap-2 py-4 text-xs text-[color:var(--color-text-muted)]"
              role="status"
            >
              <Loader2
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
                data-testid="copy-suggest-loading"
              />
              <span>추천 문구를 생성하고 있어요...</span>
            </div>
          )}

          {!isLoading && error && (
            <div className="py-2">
              <p className="text-xs text-[color:var(--color-danger)]">{error}</p>
              <button
                type="button"
                onClick={runGenerate}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-primary)]"
              >
                <RotateCw className="h-3 w-3" />
                다시 시도
              </button>
            </div>
          )}

          {!isLoading && !error && suggestions.length > 0 && (
            <>
              <ul className="flex flex-col gap-1.5">
                {suggestions.map((s, i) => (
                  <li key={`${i}-${s}`}>
                    <button
                      type="button"
                      onClick={() => handleApply(s)}
                      className="flex w-full items-center justify-between gap-2 rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] px-2 py-1.5 text-left text-xs text-[color:var(--color-text-primary)] transition hover:border-[color:var(--color-primary)] hover:bg-[var(--color-surface)]"
                    >
                      <span className="line-clamp-2">{s}</span>
                      <span className="shrink-0 text-[10px] font-semibold text-[color:var(--color-primary)]">
                        적용
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={runGenerate}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-primary)]"
              >
                <RotateCw className="h-3 w-3" />
                다시 생성
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
