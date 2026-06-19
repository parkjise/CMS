'use client'

import { useClientAuthStore } from '@/lib/authStore'

export function EditModeBanner() {
  const isEditMode = useClientAuthStore((s) => s.isEditMode)
  if (!isEditMode) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-amber-500 px-4 py-2 text-center text-xs font-medium text-white"
    >
      편집 모드 활성화 — 인라인 편집은 다음 페이즈에서 활성화됩니다
    </div>
  )
}
