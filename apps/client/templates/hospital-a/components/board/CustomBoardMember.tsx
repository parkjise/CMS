'use client'

import type { PublicBoard } from '@cms/types'
import {
  type MemberBoardQuery,
  memberLoginHref,
  useMemberBoard,
} from '@/components/board/useMemberBoard'
import { pageHref } from '../../../shared/contracts'
import type { SearchTarget } from './BoardToolbar'
import {
  type BoardHrefFor,
  type BoardLink,
  BoardMessage,
  CustomBoardDetail,
  CustomBoardList,
} from './CustomBoardViews'

interface CustomBoardMemberProps {
  board: PublicBoard
  tenantSlug: string
  query: MemberBoardQuery
  link: BoardLink
  searchTarget: SearchTarget
  memberEnabled: boolean
}

/** 회원만 읽는 게시판 (T-150) — 로그인 안내, 또는 브라우저에서 읽은 글 */
export function CustomBoardMember({
  board,
  tenantSlug,
  query,
  link,
  searchTarget,
  memberEnabled,
}: CustomBoardMemberProps) {
  const state = useMemberBoard(tenantSlug, board, query, memberEnabled)
  const hrefFor: BoardHrefFor = (extra) =>
    pageHref(tenantSlug, link.pageKey, link.previewQuery, { ...extra, noSlug: link.noSlug })

  if (state.kind === 'list') {
    return (
      <CustomBoardList
        board={board}
        list={state.list}
        hrefFor={hrefFor}
        searchTarget={searchTarget}
      />
    )
  }
  if (state.kind === 'detail')
    return <CustomBoardDetail board={board} post={state.post} hrefFor={hrefFor} />
  if (state.kind === 'missing')
    return <BoardMessage board={board} text="게시글을 찾을 수 없습니다." />
  if (state.kind === 'error')
    return (
      <BoardMessage board={board} text="글을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요." />
    )

  return (
    <section className="board-list" aria-labelledby="board-gate-title">
      <div className="page-container">
        <h2 className="board-list__title" id="board-gate-title">
          {board.name}
        </h2>
        <div className="board-gate" aria-live="polite">
          {state.kind === 'checking' ? (
            <p className="board-gate__text">로그인 정보를 확인하고 있습니다…</p>
          ) : (
            <>
              <i className="ri-lock-line board-gate__icon" aria-hidden="true" />
              <p className="board-gate__text">회원만 볼 수 있는 게시판입니다.</p>
              {state.kind === 'login' ? (
                <a className="board-gate__button" href={memberLoginHref(tenantSlug)}>
                  로그인
                </a>
              ) : (
                <p className="board-gate__hint">지금은 볼 수 없습니다.</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
