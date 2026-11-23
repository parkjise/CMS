/**
 * AI 보조 (관리자 화면 개선 · AI 보조 기획서 2장) — 화면만 먼저 (T-231-A).
 * 서버 `POST /api/v1/ai/assist/{kind}` 는 T-231-B. 그전에는 기능 스위치가 없어 버튼이 숨고,
 * 개발 서버의 미리보기 모드에서만 예시 결과로 눌러 본다.
 */

/** 기능 스위치 — 슈퍼 어드민이 하나씩 끈다 (기획서 2.0) */
export const AI_SITE_ASSIST = 'AI_SITE_ASSIST'
export const AI_BOARD_ASSIST = 'AI_BOARD_ASSIST'

export type AssistKind = 'seo' | 'geo'

export type AssistTone = 'trust' | 'friendly' | 'expert'

export const TONES: { value: AssistTone; label: string }[] = [
  { value: 'trust', label: '신뢰감' },
  { value: 'friendly', label: '친근함' },
  { value: 'expert', label: '전문적' },
]

/** kind 마다 서버가 돌려줄 값 — 글자 수 · 개수는 서버가 저장 규칙대로 잘라 준다 */
export interface AssistResults {
  seo: { meta_title: string; meta_description: string; keywords: string[] }
  geo: { description: string; topics: string[] }
}

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
