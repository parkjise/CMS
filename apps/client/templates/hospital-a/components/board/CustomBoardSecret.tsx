'use client'

import { useEffect, useState } from 'react'
import type { GuestPost, PublicBoard, PublicPost } from '@cms/types'
import { fetchMemberPost } from '@/lib/memberBoard'
import { useIsMember } from '@/lib/memberStore'
import { pageHref } from '../../../shared/contracts'
import { type BoardHrefFor, type BoardLink, CustomBoardDetail } from './CustomBoardViews'
import { GuestUnlock } from './GuestPostTools'

interface CustomBoardSecretProps {
  board: PublicBoard
  tenantSlug: string
  /** 서버가 읽은 잠긴 글 — 제목만 있다 */
  post: PublicPost
  link: BoardLink
}

/**
 * 비밀글 상세 (T-151-A) — 서버 화면에는 내용이 없다. 쓴 회원이 로그인해 있으면
 * 브라우저에서 회원 토큰으로 다시 읽어 내용을 보여 준다(캐시하지 않는 응답).
 */
export function CustomBoardSecret({ board, tenantSlug, post, link }: CustomBoardSecretProps) {
  const isMember = useIsMember(tenantSlug)
  const [opened, setOpened] = useState<PublicPost | null>(null)
  const hrefFor: BoardHrefFor = (extra) =>
    pageHref(tenantSlug, link.pageKey, link.previewQuery, { ...extra, noSlug: link.noSlug })

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
    <CustomBoardDetail
      board={board}
      post={opened ?? post}
      hrefFor={hrefFor}
      tenantSlug={tenantSlug}
      secretActions={
        post.is_guest ? (
          <GuestUnlock board={board} tenantSlug={tenantSlug} postId={post.id} onOpen={openGuest} />
        ) : undefined
      }
    />
  )
}
