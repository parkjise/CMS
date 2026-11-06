'use client'

import { useEffect, useState } from 'react'
import type { PublicBoard, PublicPost } from '@cms/types'
import { type BoardPage, loadBoardPage } from '@/lib/boardRoute'
import { MemberBoardDenied, fetchMemberPost, fetchMemberPosts } from '@/lib/memberBoard'
import { useIsMember, useMemberStore } from '@/lib/memberStore'
import { sitePath } from '@/lib/siteHost'

export interface MemberBoardQuery {
  detailId?: string
  page: number
  q?: string
  c?: string
}

export type MemberBoardState =
  | { kind: 'checking' }
  | { kind: 'login' }
  /** 회원 기능이 꺼진 사업체 — 아무도 읽을 수 없다 */
  | { kind: 'closed' }
  | { kind: 'list'; list: BoardPage }
  | { kind: 'detail'; post: PublicPost }
  | { kind: 'missing' }
  | { kind: 'error' }

/**
 * 회원만 읽는 게시판 (T-150) — 로그인을 확인하고 브라우저에서 글을 읽는다.
 * 서버 화면에는 글이 없고, 로그인하지 않았으면 로그인 안내를 그린다.
 */
export function useMemberBoard(
  tenantSlug: string,
  board: PublicBoard,
  { detailId, page, q, c }: MemberBoardQuery,
  memberEnabled: boolean
): MemberBoardState {
  const isMember = useIsMember(tenantSlug)
  const ready = useMemberStore((s) => s.slug === tenantSlug && s.status === 'ready')
  const [state, setState] = useState<MemberBoardState>({ kind: 'checking' })

  useEffect(() => {
    if (!memberEnabled) {
      setState({ kind: 'closed' })
      return
    }
    if (!ready) return
    if (!isMember) {
      setState({ kind: 'login' })
      return
    }
    let cancelled = false
    setState({ kind: 'checking' })
    const load = async (): Promise<MemberBoardState> => {
      try {
        if (detailId) {
          const post = await fetchMemberPost(tenantSlug, board.slug, detailId)
          return post ? { kind: 'detail', post } : { kind: 'missing' }
        }
        return {
          kind: 'list',
          list: await loadBoardPage(tenantSlug, board, { page, q, c }, fetchMemberPosts),
        }
      } catch (error) {
        return error instanceof MemberBoardDenied ? { kind: 'login' } : { kind: 'error' }
      }
    }
    void load().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [memberEnabled, ready, isMember, tenantSlug, board, detailId, page, q, c])

  return state
}

/** 로그인 뒤 지금 주소로 돌아온다 */
export const memberLoginHref = (tenantSlug: string): string => {
  const next =
    typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`
  return `${sitePath(tenantSlug, '/member/login')}${next ? `?next=${encodeURIComponent(next)}` : ''}`
}
