import type { Page } from '@/hooks/usePages'

/** 페이지 주소 규칙 — 서버와 같다 (services/page.py, T-237) */
export const PAGE_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const PAGE_KEY_MIN = 2
export const PAGE_KEY_MAX = 40

export const pageKeyError = (key: string): string | undefined =>
  key.length >= PAGE_KEY_MIN && key.length <= PAGE_KEY_MAX && PAGE_KEY_PATTERN.test(key)
    ? undefined
    : `영문 소문자 · 숫자 · 하이픈으로 ${PAGE_KEY_MIN}~${PAGE_KEY_MAX}자 입력해 주세요.`

/** 홈페이지 주소 — 홈은 사이트 주소 그대로 */
export const pagePath = (key: string): string => (key === 'home' ? '/' : `/${key}`)

/** 상위로 고를 수 있는 페이지 — 홈이 아닌 맨 위 페이지 (1단계 묶음, T-237) */
export const parentOptions = (pages: Page[], self?: Page) =>
  pages.filter((p) => p.page_key !== 'home' && !p.parent_key && p.id !== self?.id)
