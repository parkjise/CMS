import type { PublicSection } from './publicSite.types'

// 테마형 템플릿 홈페이지가 그릴 섹션 고르기 (T-057-A)
// 코드형 템플릿용 내용(하위 페이지 섹션 · 메인 슬라이드 등)이 남아 있어도
// 본문 · 메뉴에는 홈 페이지의 그릴 수 있는 섹션만 쓴다.

/** 테마형 홈페이지가 그릴 수 있는 섹션 (components/sections/SectionRenderer) */
export const THEME_SECTION_TYPES: readonly string[] = [
  'HERO_BANNER',
  'INTRO',
  'SERVICES',
  'GALLERY',
  'CONTACT',
  'MAP',
]

export const isThemeRenderable = (section: PublicSection): boolean =>
  THEME_SECTION_TYPES.includes(section.section_type)

const onHomePage = (section: PublicSection): boolean =>
  (section.page_key ?? 'home') === 'home'

/** 홈 페이지 · 노출 중 · 그릴 수 있는 섹션 (순서 유지) */
export const themeHomeSections = (sections: PublicSection[]): PublicSection[] =>
  sections.filter((s) => s.is_active && onHomePage(s) && isThemeRenderable(s))

/** 노출 중이지만 이 템플릿에서는 보이지 않는 섹션 수 — 미리보기 안내용 */
export const hiddenInThemeCount = (sections: PublicSection[]): number =>
  sections.filter((s) => s.is_active).length - themeHomeSections(sections).length
