'use client'

import { canEditSite, featureOn, useClientAuthStore } from '@/lib/authStore'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'

/** 로그인한 관리자에게만 — 이 게시판의 글쓰기 화면으로 */
export function ThemeWriteLink({ board }: { board: string }) {
  const canEdit = useClientAuthStore(canEditSite)
  const enabled = useClientAuthStore(featureOn('BOARD_MANAGER'))
  if (!canEdit || !enabled) return null
  return (
    <a
      href={`${ADMIN_URL}/admin/boards?write=${encodeURIComponent(board)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[color:var(--color-text-primary)] hover:bg-[var(--color-surface)]"
    >
      글쓰기
    </a>
  )
}
