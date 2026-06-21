'use client'

import { ExternalLink } from 'lucide-react'
import { useEditStore } from '@/lib/editStore'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'

export function EditModeBanner() {
  const isEditMode = useEditStore((s) => s.isEditMode)
  if (!isEditMode) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex w-full items-center justify-between gap-3 bg-[var(--color-warning)] px-4 py-2 text-xs font-medium text-[color:var(--color-on-warning)]"
    >
      <span className="truncate">편집 모드 활성화</span>
      <a
        href={`${ADMIN_URL}/admin/dashboard`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 underline-offset-2 hover:underline"
      >
        <span>관리자 페이지</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
