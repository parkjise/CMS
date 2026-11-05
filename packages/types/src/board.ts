/** 게시판 · 게시글 (T-139, 게시판 모듈 기획서 8 · 9장) */

export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'PRIVATE'

/** 본문 블록 — HTML 을 저장하지 않는다. p 는 줄바꿈 · **굵게** 만 */
export type BodyBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'image'; src: string; alt: string }

/** 게시판 칸 타입 (T-142-A) */
export type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DATE'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'BOOLEAN'
  | 'RATING'
  | 'IMAGE'

export interface FieldOption {
  value: string
  label: string
}

export interface BoardField {
  id: string
  board_id: string
  field_key: string
  label: string
  field_type: FieldType
  is_required: boolean
  is_visible: boolean
  help_text: string
  placeholder: string
  default_value: unknown
  options: FieldOption[]
  min: number | null
  max: number | null
  display_order: number
  deleted_at: string | null
  /** 값이 있는 글 수 (휴지통 글 포함) */
  value_count: number
}

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
  /** 필드 값 {field_key: 값} (T-142-A) */
  custom_data: Record<string, unknown>
}

/** 전체 글 목록 한 줄 (BM-05, T-140-C) */
export interface PostOverviewItem extends PostListItem {
  board_name: string
}

export interface PostOverviewList {
  total: number
  page: number
  size: number
  items: PostOverviewItem[]
}

export type PostBulkAction = 'PUBLISH' | 'PRIVATE' | 'TRASH' | 'RESTORE'

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

/** 사이트맵 한 줄 (T-140-C) */
export interface PublicSitemapPost {
  board_slug: string
  is_system: boolean
  id: string
  updated_at: string
}

export interface PublicPost extends Omit<PublicPostItem, 'body'> {
  body: BodyBlock[]
  prev_id: string | null
  next_id: string | null
}
