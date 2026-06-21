'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, LayoutGrid, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { useEditStore } from '@/lib/editStore'
import { ExitConfirmDialog } from '@/components/layout/ExitConfirmDialog'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'

export function EditToolbar() {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const pendingChanges = useEditStore((s) => s.pendingChanges)
  const isDirty = useEditStore((s) => s.isDirty)
  const saveAll = useEditStore((s) => s.saveAll)
  const exitEditMode = useEditStore((s) => s.exitEditMode)

  const [saving, setSaving] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)

  const changeCount = Object.keys(pendingChanges).length

  // body 클래스 토글 (T-063+ 인라인 편집 UI 스타일 제어용)
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('edit-mode', isEditMode)
    return () => {
      document.body.classList.remove('edit-mode')
    }
  }, [isEditMode])

  // 페이지 이탈 방지 (isDirty 시)
  useEffect(() => {
    if (!isEditMode || !isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isEditMode, isDirty])

  if (!isEditMode) return null

  const handleSave = async () => {
    if (changeCount === 0) return
    setSaving(true)
    try {
      const result = await saveAll()
      if (result.failed_count === 0) {
        toast.success(`${result.saved_count}개 변경사항을 저장했습니다.`)
      } else {
        toast.error(
          `${result.saved_count}개 저장, ${result.failed_count}개 실패. 다시 시도해주세요.`,
        )
      }
    } catch {
      toast.error('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const handleExit = () => {
    if (isDirty) {
      setExitOpen(true)
    } else {
      exitEditMode()
    }
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label="편집 모드 툴바"
        className="sticky top-0 z-50 flex w-full flex-col gap-2 border-b border-[color:var(--color-border)] bg-[var(--color-warning)] px-4 py-2 text-sm text-[color:var(--color-on-warning)] sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold">편집 모드</span>
          <a
            href={`${ADMIN_URL}/admin/templates`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-2 py-1 text-xs hover:bg-black/10"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>템플릿 변경</span>
          </a>
          <a
            href={`${ADMIN_URL}/admin/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] px-2 py-1 text-xs hover:bg-black/10"
          >
            <span>관리자 페이지</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || changeCount === 0}
            aria-label={`저장 (${changeCount}개 변경사항)`}
            className="inline-flex items-center gap-1.5 rounded-[var(--border-radius-base)] bg-[var(--color-background)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-primary)] transition hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? '저장 중...' : '저장'}</span>
            {changeCount > 0 && (
              <span className="rounded-[var(--border-radius-pill)] bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-on-primary)]">
                {changeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleExit}
            aria-label="편집 종료"
            className="inline-flex items-center gap-1.5 rounded-[var(--border-radius-base)] border border-black/20 bg-transparent px-3 py-1.5 text-xs font-medium text-[color:var(--color-on-warning)] transition hover:bg-black/10"
          >
            <X className="h-3.5 w-3.5" />
            <span>편집 종료</span>
          </button>
        </div>
      </div>

      <ExitConfirmDialog
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        onExit={exitEditMode}
      />
    </>
  )
}
