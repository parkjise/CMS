/** 게시판 · 게시글 (T-139, 게시판 모듈 기획서 8 · 9장) */

export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'PRIVATE'

/** Tiptap 노드 (T-143) — 서버가 허용 목록으로 검사한 값. HTML 을 저장하지 않는다 */
export interface RichNode {
  type: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: RichNode[]
  text?: string
}

/** 이전 본문 블록 — 기존 글 · 샘플. p 는 줄바꿈 · **굵게** 만 */
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
  | 'PHONE'
  | 'EMAIL'
  | 'URL'

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
  /** 관리자 글 목록에 값을 보여 줄지 */
  show_in_list: boolean
  display_order: number
  deleted_at: string | null
  /** 값이 있는 글 수 (휴지통 글 포함) */
  value_count: number
}

/** 글 본문 한 칸 — 새 글은 RichNode, 기존 글 · 샘플은 BodyBlock */
export type BodyNode = BodyBlock | RichNode

export type BoardType = 'LIST' | 'GALLERY' | 'FAQ'
export type BoardStatus = 'ACTIVE' | 'INACTIVE'
export type BoardSortOrder = 'LATEST' | 'OLDEST' | 'TITLE'

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
  sort_order: BoardSortOrder
  /** null 이면 유형별 기본값 (목록 10 · 갤러리 12 · FAQ 20) */
  page_size: number | null
  seo_title: string
  seo_description: string
  seo_index: boolean
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
  custom_data?: Record<string, unknown>
}

export interface Post extends PostListItem {
  body: BodyNode[]
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
  page_size?: number | null
  seo_title?: string
  seo_description?: string
  seo_index?: boolean
}

export interface PublicPostItem {
  id: string
  title: string
  is_pinned: boolean
  published_at: string
  /** 갤러리 썸네일 — 본문의 첫 사진 */
  thumbnail?: string | null
  /** FAQ 게시판 목록에만 — 답변을 펼쳐 보여 준다 */
  body?: BodyNode[] | null
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

/** 글 상세에 보여 줄 칸 — 선택지는 이름으로, 숨긴 칸 · 빈 칸은 없음 (T-142-B-2) */
export interface PublicFieldValue {
  key: string
  label: string
  field_type: FieldType
  value: string | number | boolean | string[]
}

export interface PublicPost extends Omit<PublicPostItem, 'body'> {
  body: BodyNode[]
  fields?: PublicFieldValue[]
  prev_id: string | null
  next_id: string | null
}
