/** 게시판 · 게시글 (T-139, 게시판 모듈 기획서 8 · 9장) */

export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'PRIVATE'

/** 본문 블록 — HTML 을 저장하지 않는다. p 는 줄바꿈 · **굵게** 만 */
export type BodyBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'image'; src: string; alt: string }

export type BoardType = 'LIST' | 'GALLERY' | 'FAQ'
export type BoardStatus = 'ACTIVE' | 'INACTIVE'

export interface Board {
  id: string
  name: string
  slug: string
  description: string
  board_type: BoardType
  status: BoardStatus
  system_key: string | null
  post_count: number
  /** 공지 · 메인 최신 공지에 아직 샘플 글이 보이는지 */
  has_samples: boolean
  deleted_at: string | null
}

/** 게시판 추가 한도 — limit 이 null 이면 제한 없음 (기획서 4장) */
export interface BoardLimits {
  plan: string
  limit: number | null
  used: number
  can_create: boolean
  reason: string | null
}

export interface PostListItem {
  id: string
  board_id: string
  title: string
  status: PostStatus
  is_pinned: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Post extends PostListItem {
  body: BodyBlock[]
}

export interface PostList {
  total: number
  page: number
  size: number
  items: PostListItem[]
}

/** 홈페이지에 나가는 새 게시판 (T-140-B) — 메뉴 · /b/{slug} 화면 */
export interface PublicBoard {
  id: string
  name: string
  slug: string
  description: string
  board_type: BoardType
}

export interface PublicPostItem {
  id: string
  title: string
  is_pinned: boolean
  published_at: string
  /** 갤러리 썸네일 — 본문의 첫 사진 */
  thumbnail?: string | null
  /** FAQ 게시판 목록에만 — 답변을 펼쳐 보여 준다 */
  body?: BodyBlock[] | null
}

export interface PublicPostList {
  total: number
  page: number
  size: number
  /** 검색과 관계없이 공개 글이 있는지 — 없으면 화면이 샘플을 보여 준다 */
  has_posts: boolean
  items: PublicPostItem[]
}

export interface PublicPost extends Omit<PublicPostItem, 'body'> {
  body: BodyBlock[]
  prev_id: string | null
  next_id: string | null
}
