'use client'

import { canEditSite, useClientAuthStore } from '@/lib/authStore'

/** 회원 글쓰기 게시판의 [글쓰기] (T-150-B) — 관리자는 관리자 글쓰기 버튼이 따로 있다 */
export function MemberWriteLink({ href }: { href: string }) {
  const isAdmin = useClientAuthStore(canEditSite)
  if (isAdmin) return null
  return (
    <div className="board-list__actions">
      <a className="board-list__write" href={href}>
        글쓰기
      </a>
    </div>
  )
}
