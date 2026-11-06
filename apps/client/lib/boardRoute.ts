/**
 * 새 게시판 화면의 공통 동작 (T-141) — 마크업은 템플릿마다 갖고, 찾기 · 읽기는 여기서.
 * 코드형(codeRoute · CustomBoard) · 테마형(app/[tenant_slug]/b)이 같이 쓴다.
 */
import type { BoardDesign, BoardType, PublicBoard, PublicPost, PublicPostItem, PublicPostList } from '@cms/types'
import { fetchPublicPost, fetchPublicPosts } from './publicPosts'
import type { PublicSite } from './publicSite.types'

export const BOARD_PAGE_SIZE: Record<BoardType, number> = { LIST: 10, GALLERY: 12, FAQ: 20, CARD: 12 }

const DEFAULT_DESIGN: BoardDesign = {
  columns: 3,
  image_ratio: '4:3',
  show_date: true,
  show_image: true,
  show_summary: true,
  faq_single_open: false,
  faq_first_open: false,
}

/** 게시판 디자인 (T-148) — 저장 전 게시판 · 캐시된 응답은 기본값 */
export const boardDesign = (board: PublicBoard): BoardDesign => ({ ...DEFAULT_DESIGN, ...board.design })

/**
 * 회원만 읽는 게시판 (T-150) — 서버는 글을 읽지 않는다(공개 캐시에 남지 않게).
 * 화면이 로그인을 확인하고 브라우저에서 회원 토큰으로 읽는다.
 */
export const isMemberOnly = (board: PublicBoard): boolean => board.read_access === 'MEMBER'

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
  if (isMemberOnly(board)) return { board, detailId, post: null }
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
  /** 지금 고른 카테고리 — 이 게시판의 사용 중인 분류일 때만 (T-149) */
  category?: string
}

/** 주소의 카테고리(c)가 이 게시판의 사용 중인 분류인지 — 아니면 '전체' */
export const boardCategory = (board: PublicBoard, c?: string): string | undefined =>
  c && board.categories?.some((cat) => cat.id === c) ? c : undefined

export type PostsFetcher = (
  tenantSlug: string,
  board: string,
  query: { page: number; size: number; q?: string; category?: string },
) => Promise<PublicPostList | null>

/** 글 목록 한 페이지 — 지난 주소의 페이지가 사라졌으면 마지막 페이지로. 회원 게시판은 fetchPosts 를 바꿔 쓴다 */
export async function loadBoardPage(
  tenantSlug: string,
  board: PublicBoard,
  { page, q, c }: { page: number; q?: string; c?: string },
  fetchPosts: PostsFetcher = fetchPublicPosts,
): Promise<BoardPage> {
  const size = board.page_size ?? BOARD_PAGE_SIZE[board.board_type]
  const keyword = (q ?? '').trim()
  const category = boardCategory(board, c)
  const load = (p: number) =>
    fetchPosts(tenantSlug, board.slug, { page: p, size, q: keyword || undefined, category })
  let list = await load(page)
  const total = list?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / size))
  if (page > totalPages) list = (await load(totalPages)) ?? list
  return { posts: list?.items ?? [], total, page: Math.min(page, totalPages), totalPages, keyword, category }
}
