'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useEditStore } from '@/lib/editStore'

interface Props {
  open: boolean
  onClose: () => void
  onExit: () => void
}

export function ExitConfirmDialog({ open, onClose, onExit }: Props) {
  const saveAll = useEditStore((s) => s.saveAll)
  const discardAll = useEditStore((s) => s.discardAll)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const handleSaveAndExit = async () => {
    setSaving(true)
    try {
      await saveAll()
      toast.success('변경사항을 저장했습니다.')
      onExit()
      onClose()
    } catch {
      toast.error('저장에 실패했습니다. 다시 시도하거나 그냥 종료해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscardAndExit = () => {
    discardAll()
    onExit()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-confirm-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-overlay)] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--border-radius-card)] bg-[var(--color-background)] p-6 shadow-[var(--shadow-floating)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="exit-confirm-title"
          className="text-base font-semibold text-[color:var(--color-text-primary)]"
        >
          저장되지 않은 변경사항이 있습니다
        </h2>
        <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
          편집한 내용을 저장하고 종료하시겠어요?
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[color:var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleDiscardAndExit}
            disabled={saving}
            className="rounded-[var(--border-radius-base)] border border-[color:var(--color-danger)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[color:var(--color-danger)] transition hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
          >
            그냥 종료
          </button>
          <button
            type="button"
            onClick={handleSaveAndExit}
            disabled={saving}
            className="rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장 후 종료'}
          </button>
        </div>
      </div>
    </div>
  )
}
