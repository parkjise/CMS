import type { BoardOperation, BoardPermissions, BoardType, FieldType } from '@cms/types'

/**
 * AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장) — 화면만 먼저 (T-231-A · T-232-A).
 * 서버 `POST /api/v1/ai/assist/{kind}` 는 T-231-B. 그전에는 기능 스위치가 없어 버튼이 숨고,
 * 개발 서버의 미리보기 모드에서만 예시 결과로 눌러 본다.
 */

/** 기능 스위치 — 슈퍼 어드민이 하나씩 끈다 (기획서 2.0) */
export const AI_SITE_ASSIST = 'AI_SITE_ASSIST'
export const AI_BOARD_ASSIST = 'AI_BOARD_ASSIST'

export type AssistKind = 'seo' | 'geo' | 'board' | 'post' | 'policy_summary' | 'page_seo'

export type AssistTone = 'trust' | 'friendly' | 'expert'

export const TONES: { value: AssistTone; label: string }[] = [
  { value: 'trust', label: '신뢰감' },
  { value: 'friendly', label: '친근함' },
  { value: 'expert', label: '전문적' },
]

/** 추천 칸 — 기존 칸 유형만, 고르기 칸은 선택지 이름 (기획서 A-2) */
export interface SuggestedField {
  label: string
  field_type: FieldType
  choices: string[]
}

/** 게시판 구성 추천 (A-2) — 유형은 그 사업체가 고를 수 있는 것만, 위험한 권한 조합은 서버가 고친다 */
export interface BoardSuggestion {
  board_type: BoardType
  name: string
  description: string
  /** 최대 8개 */
  fields: SuggestedField[]
  /** 최대 10개 */
  categories: string[]
  permissions: BoardPermissions
  operation: BoardOperation
  /** 권한 · 운영을 이렇게 추천한 까닭 한 줄 */
  reason: string
}

/** 글 초안 본문 한 칸 — 문단 · 글머리 목록만, 글자 그대로 (기획서 A-3) */
export type DraftBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

/** 공지 · FAQ 글 초안 (A-3) — FAQ 게시판이면 제목은 질문 하나, 본문은 답변 */
export interface PostDraftSuggestion {
  titles: string[]
  body: DraftBlock[]
}

/** kind 마다 서버가 돌려줄 값 — 글자 수 · 개수는 서버가 저장 규칙대로 잘라 준다 */
export interface AssistResults {
  seo: { meta_title: string; meta_description: string; keywords: string[] }
  geo: { description: string; topics: string[] }
  board: BoardSuggestion
  post: PostDraftSuggestion
  /** 1 ~ 3줄, 500자 안 (A-4) */
  policy_summary: { summary: string }
  /** 페이지 검색 문구 — 페이지 설정 칸 이름 그대로 (PM-02, T-248) */
  page_seo: { seo_title: string; seo_description: string }
}

/** kind 마다 화면이 보내는 값 — 나머지(사이트 정보 · 업종 · 있는 게시판)는 서버가 직접 읽는다 */
export interface AssistInputs {
  seo: { tone: AssistTone }
  geo: { tone: AssistTone }
  /** board_id 가 있으면 그 게시판에 더할 필드 · 카테고리를 추천 (필드 · 카테고리 화면) */
  board: { purpose: string; board_id?: string }
  /** 게시판 유형 · 사업체 이름 · 연락처는 서버가 board_id 와 사이트 기본정보로 읽는다 */
  post: { memo: string; board_id: string }
  /** 편집 중인 본문 — 서버가 공개본(없으면 기본 문안)과 줄 단위로 비교해 바뀐 줄만 모델에 보낸다 */
  policy_summary: { kind: 'terms' | 'privacy'; body: string }
  /** 페이지 이름 · 그 페이지 섹션 제목은 서버가 page_id 로 읽는다 (홈은 사이트 SEO) */
  page_seo: { tone: AssistTone; page_id: string }
}

export const PURPOSE_MAX = 200
export const MEMO_MAX = 500

export interface AssistUsage {
  used: number
  /** null 이면 무제한 */
  limit: number | null
  remaining: number | null
}

export interface AssistResponse<K extends AssistKind> {
  result: AssistResults[K]
  usage: AssistUsage
}

/** 개발 서버에서 `?ai-preview` 로 켜는 미리보기 — 운영 빌드에서는 늘 꺼짐 */
const PREVIEW_KEY = 'cms-ai-preview'

export function isAiPreview(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    if (new URLSearchParams(window.location.search).has('ai-preview')) {
      window.sessionStorage.setItem(PREVIEW_KEY, '1')
    }
    return window.sessionStorage.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

/** 결과에 숫자가 있으면 사실인지 확인하라고 알린다 (기획서 A-1) */
export const hasNumber = (text: string) => /\d/.test(text)

/** 약관 요약 칸은 한 줄 입력 (A-4) — 줄을 이어 붙이고 길이를 맞춘다 */
export const toSummaryLine = (text: string, maxLength: number) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, maxLength)
