'use client'

import { useEffect, useState } from 'react'
import type { GuestPost, PublicBoard, PublicPost } from '@cms/types'
import { fetchMemberPost } from '@/lib/memberBoard'
import { useIsMember } from '@/lib/memberStore'
import { pageHref } from '@/templates/shared/contracts'
import { type HrefExtra, ThemeBoardDetail } from './ThemeBoard'
import { ThemeGuestUnlock } from './ThemeGuestTools'

interface ThemeBoardSecretProps {
  board: PublicBoard
  tenantSlug: string
  /** 서버가 읽은 잠긴 글 — 제목만 있다 */
  post: PublicPost
  pageKey: string
  noSlug: boolean
}

/** 비밀글 상세 — 테마형 (T-151-A). 쓴 회원이면 브라우저에서 다시 읽어 내용을 보여 준다 */
export function ThemeBoardSecret({ board, tenantSlug, post, pageKey, noSlug }: ThemeBoardSecretProps) {
  const isMember = useIsMember(tenantSlug)
  const [opened, setOpened] = useState<PublicPost | null>(null)
  const hrefFor = (extra?: HrefExtra) => pageHref(tenantSlug, pageKey, undefined, { ...extra, noSlug })

  useEffect(() => {
    // 비회원 비밀글은 로그인과 관계없이 글 비밀번호로 연다 (T-151-B)
    if (!isMember || post.is_guest) {
      setOpened(null)
      return
    }
    let cancelled = false
    fetchMemberPost(tenantSlug, board.slug, post.id)
      .then((full) => !cancelled && setOpened(full && !full.locked ? full : null))
      .catch(() => !cancelled && setOpened(null))
    return () => {
      cancelled = true
    }
  }, [isMember, tenantSlug, board.slug, post.id, post.is_guest])

  const openGuest = (guest: GuestPost) =>
    setOpened({ ...post, title: guest.title, body: guest.body, fields: guest.fields, locked: false })

  return (
    <ThemeBoardDetail
      board={board}
      post={opened ?? post}
      hrefFor={hrefFor}
      tenantSlug={tenantSlug}
      secretActions={
        post.is_guest ? (
          <ThemeGuestUnlock board={board} tenantSlug={tenantSlug} postId={post.id} onOpen={openGuest} />
        ) : undefined
      }
    />
  )
}
