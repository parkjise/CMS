import type { PublicBoard } from '@cms/types'
import { boardScreen, isMemberOnly, loadBoardPage } from '@/lib/boardRoute'
import { fetchPublicPost } from '@/lib/publicPosts'
import type { SearchTarget } from './BoardToolbar'
import { CustomBoardMember } from './CustomBoardMember'
import { CustomBoardWrite } from './CustomBoardWrite'
import {
  type BoardHrefFor,
  type BoardLink,
  CustomBoardDetail,
  CustomBoardList,
} from './CustomBoardViews'

interface CustomBoardProps {
  board: PublicBoard
  tenantSlug: string
  detailId?: string
  q?: string
  /** 주소의 카테고리 id (T-149) */
  c?: string
  page: number
  hrefFor: BoardHrefFor
  searchTarget: SearchTarget
  link: BoardLink
  /** 방문자 회원 기능 — 회원만 읽는 게시판의 로그인 안내 (T-150) */
  memberEnabled: boolean
}

/** 고객이 추가한 게시판 — 유형별 목록 + 공통 상세 (게시판 모듈 기획서 5.3 · 7장, T-140-B) */
export async function CustomBoard({
  board,
  tenantSlug,
  detailId,
  q,
  c,
  page,
  hrefFor,
  searchTarget,
  link,
  memberEnabled,
}: CustomBoardProps) {
  // 회원 글쓰기 · 고치기 (T-150-B) — 쓸 수 있는 게시판인지는 주소를 찾을 때 확인했다
  const screen = boardScreen(detailId)
  if (screen.kind === 'write' || screen.kind === 'edit') {
    return (
      <CustomBoardWrite
        board={board}
        tenantSlug={tenantSlug}
        postId={screen.kind === 'edit' ? screen.postId : undefined}
        link={link}
        memberEnabled={memberEnabled}
      />
    )
  }
  // 회원만 읽는 게시판은 서버가 글을 읽지 않는다 — 브라우저가 로그인을 확인하고 읽는다 (T-150)
  if (isMemberOnly(board)) {
    return (
      <CustomBoardMember
        board={board}
        tenantSlug={tenantSlug}
        query={{ detailId, page, q, c }}
        link={link}
        searchTarget={searchTarget}
        memberEnabled={memberEnabled}
      />
    )
  }
  if (detailId) {
    const post = await fetchPublicPost(tenantSlug, board.slug, detailId)
    return <CustomBoardDetail board={board} post={post} hrefFor={hrefFor} tenantSlug={tenantSlug} />
  }
  const list = await loadBoardPage(tenantSlug, board, { page, q, c })
  return <CustomBoardList board={board} list={list} hrefFor={hrefFor} searchTarget={searchTarget} />
}
