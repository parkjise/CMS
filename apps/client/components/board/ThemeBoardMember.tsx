'use client'

import type { PublicBoard } from '@cms/types'
import { Lock } from 'lucide-react'
import { pageHref } from '@/templates/shared/contracts'
import { type HrefExtra, ThemeBoardDetail, ThemeBoardListView } from './ThemeBoard'
import { type MemberBoardQuery, memberLoginHref, useMemberBoard } from './useMemberBoard'

interface ThemeBoardMemberProps {
  board: PublicBoard
  tenantSlug: string
  query: MemberBoardQuery
  /** 게시판 페이지 키 (b/{slug}) */
  pageKey: string
  noSlug: boolean
  memberEnabled: boolean
}

const muted = 'text-[color:var(--color-text-muted)]'
const primary = 'text-[color:var(--color-text-primary)]'

/** 회원만 읽는 게시판 — 테마형 (T-150). 로그인 안내, 또는 브라우저에서 읽은 글 */
export function ThemeBoardMember({
  board,
  tenantSlug,
  query,
  pageKey,
  noSlug,
  memberEnabled,
}: ThemeBoardMemberProps) {
  const state = useMemberBoard(tenantSlug, board, query, memberEnabled)
  const hrefFor = (extra?: HrefExtra) =>
    pageHref(tenantSlug, pageKey, undefined, { ...extra, noSlug })

  if (state.kind === 'list') {
    return (
      <ThemeBoardListView
        board={board}
        list={state.list}
        hrefFor={hrefFor}
        searchAction={hrefFor()}
      />
    )
  }
  if (state.kind === 'detail')
    return <ThemeBoardDetail board={board} post={state.post} hrefFor={hrefFor} />

  const message =
    state.kind === 'checking'
      ? '로그인 정보를 확인하고 있습니다…'
      : state.kind === 'missing'
        ? '게시글을 찾을 수 없습니다.'
        : state.kind === 'error'
          ? '글을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
          : '회원만 볼 수 있는 게시판입니다.'
  const locked = state.kind === 'login' || state.kind === 'closed'

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <h1 className={`text-2xl font-bold md:text-3xl ${primary}`}>{board.name}</h1>
      <div
        className="mt-8 flex flex-col items-center gap-4 border-y border-[color:var(--color-border)] px-5 py-16 text-center"
        aria-live="polite"
      >
        {locked && <Lock className={`h-8 w-8 ${muted}`} aria-hidden />}
        <p className={`font-semibold ${locked ? primary : muted}`}>{message}</p>
        {state.kind === 'login' && (
          <a
            href={memberLoginHref(tenantSlug)}
            className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white"
          >
            로그인
          </a>
        )}
        {state.kind === 'closed' && <p className={`text-sm ${muted}`}>지금은 볼 수 없습니다.</p>}
      </div>
    </section>
  )
}
