'use client'

import { useMemberLoginHref } from '@/components/board/useMemberBoard'
import { useIsMember } from '@/lib/memberStore'
import { SECRET_TEXT } from '@/lib/boardRoute'

/** 잠긴 비밀글 안내 — 로그인하지 않았으면 로그인 링크 (T-151-A) */
export function SecretNotice({ tenantSlug }: { tenantSlug: string }) {
  const isMember = useIsMember(tenantSlug)
  const loginHref = useMemberLoginHref(tenantSlug)
  return (
    <div className="board-view__secret">
      <i className="ri-lock-line" aria-hidden="true" />
      <p>{SECRET_TEXT}</p>
      {!isMember && (
        <a className="board-list__write" href={loginHref}>
          로그인
        </a>
      )}
    </div>
  )
}
