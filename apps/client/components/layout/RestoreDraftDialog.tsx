'use client'

import { useEffect, useState } from 'react'
import { useClientAuthStore } from '@/lib/authStore'
import { useEditStore } from '@/lib/editStore'

/**
 * 페이지 로드 시 localStorage에 저장된 편집 초안이 있으면
 * 사용자에게 복구 여부를 묻는다 (옵션 B).
 *
 * - 비로그인 → 그냥 폐기 (관리자만 편집 가능)
 * - 로그인 + 초안 있음 → 복구 / 폐기 다이얼로그
 * - 복구 선택 시 → 편집 모드 자동 진입
 * - 폐기 선택 시 → pendingChanges 초기화
 */
export function RestoreDraftDialog() {
  const isLoggedIn = useClientAuthStore((s) => s.isLoggedIn)
  const pendingChanges = useEditStore((s) => s.pendingChanges)
  const isDirty = useEditStore((s) => s.isDirty)
  const discardAll = useEditStore((s) => s.discardAll)
  const enterEditMode = useEditStore((s) => s.enterEditMode)

  const [open, setOpen] = useState(false)

  useEffect(() => {
    const count = Object.keys(pendingChanges).length
    if (!isDirty || count === 0) {
      setOpen(false)
      return
    }
    if (!isLoggedIn) {
      // 비로그인 상태에서는 초안 복구 의미 없음 → 폐기
      discardAll()
      setOpen(false)
      return
    }
    setOpen(true)
    // intentionally run when login state or pending count changes
  }, [isLoggedIn, isDirty, pendingChanges, discardAll])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null

  const handleRestore = () => {
    enterEditMode()
    setOpen(false)
  }

  const handleDiscard = () => {
    discardAll()
    setOpen(false)
  }

  const count = Object.keys(pendingChanges).length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-draft-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-overlay)] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-[var(--border-radius-card)] bg-[var(--color-background)] p-6 shadow-[var(--shadow-floating)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="restore-draft-title"
          className="text-base font-semibold text-[color:var(--color-text-primary)]"
        >
          저장되지 않은 편집 초안이 있습니다
        </h2>
        <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
          이전 세션에서 편집한 {count}개 변경사항이 남아있어요. 편집 모드를
          이어서 사용하시겠어요?
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded-[var(--border-radius-base)] border border-[color:var(--color-danger)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[color:var(--color-danger)] transition hover:bg-[var(--color-danger)]/10"
          >
            초안 폐기
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className="rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
          >
            편집 이어가기
          </button>
        </div>
      </div>
    </div>
  )
}
