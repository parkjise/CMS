'use client'

import type { PublicBoard } from '@cms/types'
import { useMyPost } from '@/components/board/useMemberPostForm'

interface MemberPostActionsProps {
  board: PublicBoard
  tenantSlug: string
  postId: string
  editHref: string
  listHref: string
}

/** 로그인한 회원이 쓴 글이면 [수정] [삭제] (T-150-B) — 서버가 작성자를 확인한다 */
export function MemberPostActions({
  board,
  tenantSlug,
  postId,
  editHref,
  listHref,
}: MemberPostActionsProps) {
  const { mine, deleting, remove } = useMyPost(tenantSlug, board, postId, () =>
    window.location.assign(listHref)
  )
  if (!mine) return null
  return (
    <div className="board-list__actions">
      <a className="board-list__write" href={editHref}>
        수정
      </a>
      <button
        className="board-list__write"
        type="button"
        disabled={deleting}
        onClick={() => void remove()}
      >
        {deleting ? '삭제 중…' : '삭제'}
      </button>
    </div>
  )
}
