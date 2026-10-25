import type { SectionType } from './section'

export type TemplateIndustry =
  | 'HOSPITAL'
  | 'PENSION'
  | 'STARTUP'
  | 'RESTAURANT'
  | 'SHOP'
  | 'EDUCATION'
  | 'GENERAL'

export interface CSSVariableSet {
  color_primary: string
  color_secondary: string
  color_accent: string
  color_background: string
  color_surface: string
  color_text_primary: string
  color_text_secondary: string

  font_heading: string
  font_body: string
  font_size_base: string
  font_weight_heading: string

  border_radius_base: string
  border_radius_card: string
  shadow_card: string

  spacing_section: string
  spacing_container: string
}

export interface SectionLayoutConfig {
  hero_style: 'fullscreen' | 'split' | 'centered' | 'magazine'
  card_style: 'grid' | 'list' | 'masonry' | 'carousel'
  nav_style: 'sticky' | 'transparent' | 'sidebar'
  footer_style: 'minimal' | 'full' | 'centered'
}

export interface Template {
  id: string
  name: string
  description: string
  thumbnail_url: string
  preview_url: string
  industry_tags: TemplateIndustry[]
  css_variables: CSSVariableSet
  section_layout: SectionLayoutConfig
  is_premium: boolean
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface TemplateListItem {
  id: string
  name: string
  thumbnail_url: string
  preview_url: string
  industry_tags: TemplateIndustry[]
  is_premium: boolean
  is_current: boolean
}

export interface TenantTemplateOverride {
  id: string
  tenant_id: string
  template_id: string
  css_overrides: Partial<CSSVariableSet>
  applied_at: string
  updated_at: string
}

// ── 코드형 템플릿 (기획서 11.7 ~ 11.9) ─────────────────────────────

/** theme: 공용 섹션 컴포넌트 + CSS 변수 / code: 템플릿 전용 마크업·스타일 */
export type TemplateRenderer = 'theme' | 'code'

/** 코드형 템플릿의 스타일 작성 방식 */
export type TemplateStyling = 'tailwind' | 'scss'

/** 템플릿이 제공하는 페이지 (메인 + 서브) */
export interface TemplatePage {
  /** 'home' | 'about' | 'notice' … — 주소 /{slug}/{key} (home 은 /{slug}) */
  key: string
  /** 메뉴·브레드크럼 이름 */
  title: string
  /** 하위 탭에 보일 이름 (없으면 title) — 예: 메뉴 '회사소개' / 탭 '브랜드 소개' */
  tab_title?: string
  menu: 'gnb' | 'sub' | 'account' | 'none'
  /** 하위 탭 묶음 (예: about-history → about) */
  parent?: string
  default_sections: SectionType[]
}

export interface TemplateManifest {
  /** 코드 폴더 이름 (apps/client/templates/{key}) */
  key: string
  /** templates.id — 'TPL_HOSPITAL_A' */
  id: string
  name: string
  renderer: TemplateRenderer
  styling: TemplateStyling
  /** 샘플 콘텐츠·마크업 변경 추적 (샘플 이미지 경로에도 사용) */
  version: string
  pages: TemplatePage[]
  /** 지원 섹션 타입 — 없는 타입은 렌더링 생략 */
  sections: SectionType[]
  /** theme.ts KEY_MAP 짧은 키 기준 기본 토큰 */
  css_variables: Record<string, string>
}

export interface TemplateApplyRequest {
  template_id: string
  /** keep(기본): 콘텐츠 유지 / replace_with_sample: 템플릿 샘플로 교체 (기획서 11.8) */
  content_mode?: 'keep' | 'replace_with_sample'
}

export interface CSSOverrideUpdate {
  css_overrides: Partial<CSSVariableSet>
}
