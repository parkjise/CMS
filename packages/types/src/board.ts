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

export type BoardType = 'LIST' | 'GALLERY' | 'FAQ' | 'CARD'
export type BoardStatus = 'ACTIVE' | 'INACTIVE'
export type BoardSortOrder = 'LATEST' | 'OLDEST' | 'TITLE'

/** 게시판 디자인 (T-148) — 유형에 맞는 값만 화면에 쓴다 */
export interface BoardDesign {
  columns: 2 | 3 | 4
  image_ratio: '1:1' | '4:3' | '16:9'
  show_date: boolean
  show_image: boolean
  show_summary: boolean
  faq_single_open: boolean
  faq_first_open: boolean
}

/** 게시판 권한 (T-150) — 글쓰기 MEMBER 는 로그인한 방문자 회원도 (T-150-B) */
export type BoardReadAccess = 'PUBLIC' | 'MEMBER'
export type BoardWriteAccess = 'ADMIN' | 'MEMBER'
export interface BoardPermissions {
  read: BoardReadAccess
  write: BoardWriteAccess
}

/** 운영 설정 (T-151-A) */
export interface BoardOperation {
  /** 회원이 비밀글을 쓸 수 있는지 — 꺼도 이미 쓴 비밀글은 그대로 비밀 */
  allow_secret: boolean
  /** 회원 새 글을 관리자 화면에 실시간으로 알린다 */
  notify_new_post: boolean
  /** 비로그인 방문자도 이름 · 글 비밀번호로 쓴다 (T-151-B) */
  allow_guest: boolean
}

/** 권한 탭 — 회원 값을 고를 수 없는 이유, 고를 수 있으면 null */
export interface PermissionOptions {
  member_read_blocked: string | null
  member_write_blocked: string | null
}

export interface Board {
  /** 게시판 자체 설정의 수정 시각 (글 수정 시각과 별개) */
  updated_at: string
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
  design: BoardDesign
  permissions: BoardPermissions
  operation: BoardOperation
}

/** 게시판 카테고리 — 1단계 분류 (T-149) */
export interface BoardCategory {
  id: string
  board_id: string
  name: string
  /** 끄면 홈페이지 분류 탭에서만 빠진다 */
  is_active: boolean
  display_order: number
  /** 이 분류의 글 수 (휴지통 글 제외) */
  post_count: number
}

/** 홈페이지 분류 탭 — 사용 중인 분류만 */
export interface PublicCategory {
  id: string
  name: string
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
  /** 비밀글 (T-151-A) */
  is_secret?: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  custom_data?: Record<string, unknown>
  /** 분류 (T-149) — 없으면 null */
  category_id?: string | null
  /** 홈페이지에서 쓴 회원 (T-150-B) — 관리자 글은 null */
  author_member_id?: string | null
  author_member_name?: string | null
  /** 비회원 글의 이름 (T-151-B) */
  guest_name?: string | null
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
  design?: BoardDesign
  /** 회원만 읽기면 MEMBER — 글을 로그인 뒤 브라우저에서 읽는다 (T-150) */
  read_access?: BoardReadAccess
  /** 회원도 쓰면 MEMBER — 홈페이지 회원 글쓰기 (T-150-B) */
  write_access?: BoardWriteAccess
  /** 회원 글쓰기 폼에 비밀글 체크 (T-151-A) */
  allow_secret?: boolean
  /** 비회원 글쓰기 (T-151-B) */
  allow_guest?: boolean
  /** 사용 중인 분류 (T-149) — 없으면 탭을 그리지 않는다 */
  categories?: PublicCategory[]
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
  /** 비밀글이면 제목만 — 요약 · 사진 · 본문이 없다 (T-151-A) */
  is_secret?: boolean
  /** 비회원 글 — 글 비밀번호로 고치거나 지운다 (T-151-B) */
  is_guest?: boolean
  /** 카드형 목록에만 */
  summary?: string | null
  card_fields?: PublicFieldValue[] | null
  /** 목록형 · 갤러리 · FAQ의 제목/질문 아래에 표시할 칸 (T-160) */
  list_fields?: PublicFieldValue[] | null
  category_id?: string | null
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
  /** 비밀글인데 작성 회원이 아니면 true — 본문 · 칸이 비어 있다 (T-151-A) */
  locked?: boolean
  prev_id: string | null
  next_id: string | null
}

/** 홈페이지 회원이 쓴 글 — 고치기 화면 · 저장 결과 (T-150-B) */
export interface MemberPost {
  id: string
  title: string
  /** 글자만 — 빈 줄로 문단 */
  content: string
  category_id: string | null
  is_secret?: boolean
}

/** 비밀번호를 확인한 비회원 글 (T-151-B) */
export interface GuestPost extends MemberPost {
  guest_name: string
  body: BodyNode[]
  fields: PublicFieldValue[]
}

export type ReportReason = 'SPAM' | 'ABUSE' | 'PRIVACY' | 'OTHER'
export type ReportAction = 'DISMISS' | 'PUBLISH' | 'HIDE' | 'DELETE'

/** 신고된 글 한 줄 — 처리하지 않은 신고만 (T-151-B) */
export interface ReportedPost {
  post_id: string
  board_id: string
  board_name: string
  title: string
  status: PostStatus
  deleted: boolean
  report_count: number
  reasons: Partial<Record<ReportReason, number>>
  details: string[]
  latest_at: string
}
