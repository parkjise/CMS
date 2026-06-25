'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/lib/api'
import { useEditStore } from '@/lib/editStore'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'
const WRAPPER_SELECTOR = '[data-section-wrapper]'
const REORDER_EVENT = 'cms-section-reordered'

interface Props {
  sectionId: string
  label: string
}

interface OrderPayloadItem {
  id: string
  display_order: number
}

/** DOM에 렌더된 섹션 wrapper들을 문서 순서대로 수집 */
const getWrappers = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(WRAPPER_SELECTOR))

/**
 * 현재 DOM 순서를 기준으로 order 페이로드를 구성한다.
 * 원래 display_order 값들의 풀(pool)을 오름차순 정렬해 DOM 순서대로 재할당하여
 * 숨겨진(미렌더) 섹션의 순서값과 충돌하지 않도록 한다.
 */
const buildOrderPayload = (wrappers: HTMLElement[]): OrderPayloadItem[] => {
  const pool = wrappers
    .map((el) => Number(el.dataset.displayOrder ?? '0'))
    .sort((a, b) => a - b)
  return wrappers.map((el, idx) => ({
    id: el.dataset.sectionWrapper as string,
    display_order: pool[idx],
  }))
}

export function SectionControls({ sectionId, label }: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)

  const barRef = useRef<HTMLDivElement | null>(null)
  const [canUp, setCanUp] = useState(false)
  const [canDown, setCanDown] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  const recomputePosition = useCallback(() => {
    const wrapper = barRef.current?.closest(WRAPPER_SELECTOR) as HTMLElement | null
    if (!wrapper) return
    const wrappers = getWrappers()
    const idx = wrappers.indexOf(wrapper)
    setCanUp(idx > 0)
    setCanDown(idx >= 0 && idx < wrappers.length - 1)
  }, [])

  // 편집 모드 진입 시 + 다른 섹션의 순서 변경 시 위/아래 활성화 상태 재계산
  useEffect(() => {
    if (!isEditMode) return
    recomputePosition()
    const onReordered = () => recomputePosition()
    window.addEventListener(REORDER_EVENT, onReordered)
    return () => window.removeEventListener(REORDER_EVENT, onReordered)
  }, [isEditMode, recomputePosition])

  if (!isEditMode) return null

  const persistOrder = async (wrappers: HTMLElement[], revert: () => void) => {
    setBusy(true)
    try {
      await authApi.patch('/sections/order', {
        sections: buildOrderPayload(wrappers),
      })
      window.dispatchEvent(new Event(REORDER_EVENT))
    } catch {
      revert()
      window.dispatchEvent(new Event(REORDER_EVENT))
      toast.error('순서 변경에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setBusy(false)
    }
  }

  const move = (direction: 'up' | 'down') => {
    const wrapper = barRef.current?.closest(WRAPPER_SELECTOR) as HTMLElement | null
    const parent = wrapper?.parentElement
    if (!wrapper || !parent) return

    const sibling =
      direction === 'up'
        ? (wrapper.previousElementSibling as HTMLElement | null)
        : (wrapper.nextElementSibling as HTMLElement | null)
    if (!sibling || !sibling.matches(WRAPPER_SELECTOR)) return

    // 낙관적 업데이트: DOM에서 즉시 형제와 위치 교환
    if (direction === 'up') {
      parent.insertBefore(wrapper, sibling)
    } else {
      parent.insertBefore(sibling, wrapper)
    }

    const revert = () => {
      if (direction === 'up') {
        parent.insertBefore(sibling, wrapper)
      } else {
        parent.insertBefore(wrapper, sibling)
      }
    }

    void persistOrder(getWrappers(), revert)
  }

  const toggleHide = async () => {
    const next = !hidden
    setHidden(next) // 낙관적
    setBusy(true)
    try {
      await authApi.patch(`/sections/${sectionId}/toggle`)
      toast.success(next ? '섹션을 숨겼습니다.' : '섹션을 다시 표시합니다.')
    } catch {
      setHidden(!next) // 롤백
      toast.error('섹션 상태 변경에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        ref={barRef}
        role="toolbar"
        aria-label={`${label} 섹션 컨트롤`}
        className="section-controls pointer-events-auto absolute left-3 top-3 z-40 flex items-center gap-1 rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[color:var(--color-text-primary)] shadow-md"
      >
        <span className="flex items-center gap-1 px-1 font-medium">
          <GripVertical className="h-3.5 w-3.5 text-[color:var(--color-text-muted)]" />
          <span className="max-w-[10rem] truncate">{label}</span>
        </span>

        <button
          type="button"
          onClick={() => move('up')}
          disabled={!canUp || busy}
          aria-label="섹션 위로 이동"
          className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-1.5 py-1 transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">위로</span>
        </button>

        <button
          type="button"
          onClick={() => move('down')}
          disabled={!canDown || busy}
          aria-label="섹션 아래로 이동"
          className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-1.5 py-1 transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">아래로</span>
        </button>

        <button
          type="button"
          onClick={toggleHide}
          disabled={busy}
          aria-label={hidden ? '섹션 다시 표시' : '섹션 숨기기'}
          aria-pressed={hidden}
          className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-1.5 py-1 transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hidden ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{hidden ? '표시' : '숨기기'}</span>
        </button>

        <a
          href={`${ADMIN_URL}/admin/content`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="섹션 상세 설정 (관리자 페이지)"
          className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-1.5 py-1 transition hover:bg-[var(--color-background)]"
        >
          <Settings className="h-3.5 w-3.5" />
        </a>
      </div>

      {hidden && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex items-start justify-center bg-[var(--color-background)]/60"
        >
          <span className="mt-12 rounded-[var(--border-radius-pill)] bg-[var(--color-text-primary)] px-3 py-1 text-xs font-semibold text-[var(--color-background)]">
            숨김 처리됨
          </span>
        </div>
      )}
    </>
  )
}
