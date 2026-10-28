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

/**
 * 테마형 섹션이 읽는 칸 (백엔드 app/services/theme_content.py 와 같음, T-055-A).
 * 코드형 템플릿용 내용(title · cards 등)만 있는 섹션은 테마형에서 빈 덩어리가 된다.
 */
const THEME_FIELDS: Record<string, readonly string[]> = {
  HERO_BANNER: ['main_title', 'sub_copy', 'bg_image_url', 'cta_text', 'cta_url'],
  INTRO: ['intro_text', 'intro_image_url'],
  SERVICES: ['section_title', 'services_list'],
  GALLERY: ['section_title', 'gallery_items'],
  CONTACT: ['section_title', 'description', 'require_phone', 'require_email'],
  MAP: ['address', 'address_detail', 'latitude', 'longitude'],
}

const filledKeys = (section: PublicSection): string[] =>
  section.settings
    .filter((s) => s.field_value != null && !['', '[]'].includes(s.field_value.trim()))
    .map((s) => s.field_key)

/**
 * 다른 템플릿용 내용인지 — 값은 있는데 테마형이 읽을 칸이 하나도 없음.
 * 값이 아예 없는 섹션(새로 만든 빈 섹션)은 편집할 수 있게 남긴다.
 */
export const isForeignContent = (section: PublicSection): boolean => {
  const fields = THEME_FIELDS[section.section_type] ?? []
  const filled = filledKeys(section)
  return filled.length > 0 && !filled.some((k) => fields.includes(k))
}

/** 홈 페이지 · 노출 중 · 그릴 수 있고 다른 템플릿용 내용이 아닌 섹션 (순서 유지) */
export const themeHomeSections = (sections: PublicSection[]): PublicSection[] =>
  sections.filter(
    (s) => s.is_active && onHomePage(s) && isThemeRenderable(s) && !isForeignContent(s),
  )

/** 노출 중이지만 이 템플릿에서는 보이지 않는 섹션 수 — 미리보기 안내용 */
export const hiddenInThemeCount = (sections: PublicSection[]): number =>
  sections.filter((s) => s.is_active).length - themeHomeSections(sections).length
