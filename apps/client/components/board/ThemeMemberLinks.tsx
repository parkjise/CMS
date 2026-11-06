'use client'

import type { PublicBoard } from '@cms/types'
import { Lock } from 'lucide-react'
import { canEditSite, useClientAuthStore } from '@/lib/authStore'
import { SECRET_TEXT } from '@/lib/boardRoute'
import { useIsMember } from '@/lib/memberStore'
import { useMemberLoginHref } from './useMemberBoard'
import { useMyPost } from './useMemberPostForm'

const pill =
  'rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[color:var(--color-text-primary)] hover:bg-[var(--color-surface)] disabled:opacity-50'

/** 회원 글쓰기 게시판의 [글쓰기] — 테마형 (T-150-B). 관리자는 관리자 글쓰기 버튼이 따로 있다 */
export function ThemeMemberWriteLink({ href }: { href: string }) {
  const isAdmin = useClientAuthStore(canEditSite)
  if (isAdmin) return null
  return (
    <a href={href} className={pill}>
      글쓰기
    </a>
  )
}

interface ThemeMemberPostActionsProps {
  board: PublicBoard
  tenantSlug: string
  postId: string
  editHref: string
  listHref: string
}

/** 로그인한 회원이 쓴 글이면 [수정] [삭제] — 테마형 (T-150-B) */
export function ThemeMemberPostActions({
  board,
  tenantSlug,
  postId,
  editHref,
  listHref,
}: ThemeMemberPostActionsProps) {
  const { mine, deleting, remove } = useMyPost(tenantSlug, board, postId, () =>
    window.location.assign(listHref)
  )
  if (!mine) return null
  return (
    <>
      <a href={editHref} className={pill}>
        수정
      </a>
      <button type="button" className={pill} disabled={deleting} onClick={() => void remove()}>
        {deleting ? '삭제 중…' : '삭제'}
      </button>
    </>
  )
}

/** 잠긴 비밀글 안내 — 테마형 (T-151-A). 로그인하지 않았으면 로그인 링크 */
export function ThemeSecretNotice({ tenantSlug }: { tenantSlug: string }) {
  const isMember = useIsMember(tenantSlug)
  const loginHref = useMemberLoginHref(tenantSlug)
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-[color:var(--color-text-muted)]">
      <Lock className="h-8 w-8" aria-hidden />
      <p>{SECRET_TEXT}</p>
      {!isMember && (
        <a href={loginHref} className={pill}>
          로그인
        </a>
      )}
    </div>
  )
}
