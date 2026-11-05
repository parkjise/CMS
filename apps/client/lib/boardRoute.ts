/**
 * 새 게시판 화면의 공통 동작 (T-141) — 마크업은 템플릿마다 갖고, 찾기 · 읽기는 여기서.
 * 코드형(codeRoute · CustomBoard) · 테마형(app/[tenant_slug]/b)이 같이 쓴다.
 */
import type { BoardType, PublicBoard, PublicPost, PublicPostItem } from '@cms/types'
import { fetchPublicPost, fetchPublicPosts } from './publicPosts'
import type { PublicSite } from './publicSite.types'

export const BOARD_PAGE_SIZE: Record<BoardType, number> = { LIST: 10, GALLERY: 12, FAQ: 20 }

export interface ResolvedBoardRoute {
  board: PublicBoard
  detailId?: string
  post: PublicPost | null
}

/**
 * /b/{게시판}[/{글}] 의 게시판 · 글. 사용 중인 새 게시판만 — 없으면 null(404).
 * 없는 글 · 비공개 글도 화면을 그리기 전에 404. 공지는 /notice 가 있어 /b/notice 도 404.
 */
export async function resolveBoardRoute(
  site: PublicSite,
  tenantSlug: string,
  [boardSlug, postId, ...extra]: string[],
): Promise<ResolvedBoardRoute | null> {
  if (!boardSlug || extra.length > 0) return null
  const board = site.boards?.find((b) => b.slug === boardSlug)
  if (!board) return null
  const detailId = postId ? decodeURIComponent(postId) : undefined
  const post = detailId ? await fetchPublicPost(tenantSlug, board.slug, detailId) : null
  if (detailId && !post) return null
  return { board, detailId, post }
}

export interface BoardPage {
  posts: PublicPostItem[]
  total: number
  page: number
  totalPages: number
  keyword: string
}

/** 글 목록 한 페이지 — 지난 주소의 페이지가 사라졌으면 마지막 페이지로 */
export async function loadBoardPage(
  tenantSlug: string,
  board: PublicBoard,
  { page, q }: { page: number; q?: string },
): Promise<BoardPage> {
  const size = BOARD_PAGE_SIZE[board.board_type]
  const keyword = (q ?? '').trim()
  const load = (p: number) => fetchPublicPosts(tenantSlug, board.slug, { page: p, size, q: keyword || undefined })
  let list = await load(page)
  const total = list?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / size))
  if (page > totalPages) list = (await load(totalPages)) ?? list
  return { posts: list?.items ?? [], total, page: Math.min(page, totalPages), totalPages, keyword }
}
