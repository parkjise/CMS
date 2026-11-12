/** 이용약관 · 개인정보처리방침 (T-200) */
export type PolicyKind = 'terms' | 'privacy'

export interface SitePolicy {
  kind: PolicyKind
  title: string
  body: string
  /** 사업체가 고친 것이 없어 기본 문안 */
  is_default: boolean
  /** 사업체가 마지막으로 고친 시각 — 시행일 */
  updated_at: string | null
}

export const POLICY_TITLES: Record<PolicyKind, string> = {
  terms: '이용약관',
  privacy: '개인정보처리방침',
}

export const isPolicyKind = (value: string | undefined): value is PolicyKind =>
  value === 'terms' || value === 'privacy'

/** 고객 도메인이면 slug 없이 */
export const policyHref = (slug: string, kind: PolicyKind, noSlug = false): string =>
  `${noSlug ? '' : `/${slug}`}/${kind}`

/** 빈 줄로 나눈 문단 */
export const policyParagraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)

/** 2026-11-11T… → 2026.11.11 (한국 시간) */
export const policyDate = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .replace(/\.\s?/g, '.')
    .replace(/\.$/, '')
