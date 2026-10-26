export interface PublicTenant {
  id: string
  slug: string
  name: string
  template_type: string
  plan_type: string
  custom_domain: string | null
}

export interface PublicSettingItem {
  field_key: string
  field_value: string | null
  value_type: string
  /** 템플릿 샘플 값 그대로인지 (기획서 11.8) */
  is_sample?: boolean
}

export interface PublicSection {
  id: string
  section_type: string
  label: string
  display_order: number
  is_active: boolean
  /** 섹션이 속한 페이지 ('home' | 'about' …, 기본 home) — T-117 */
  page_key?: string
  settings: PublicSettingItem[]
}

export interface PublicSnsSettings {
  kakao_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  youtube_url: string | null
  blog_url: string | null
  naver_url: string | null
}

export interface PublicSeoSettings {
  meta_title: string | null
  meta_description: string | null
  og_image_url: string | null
  google_analytics_id: string | null
  naver_site_verification: string | null
  google_site_verification: string | null
}

export interface PublicTemplate {
  template_type: string
  /** 템플릿 코드 ('TPL_HOSPITAL_A') — 코드형 템플릿 레지스트리 키 (T-117) */
  code?: string | null
  renderer?: 'theme' | 'code'
  styling?: 'tailwind' | 'scss'
  version?: string
  name: string
  css_variables: Record<string, string>
  section_layouts: unknown[]
}

/** 방문자 회원 기능 (T-115) — 기능 플래그 SITE_MEMBER · MEMBER_RESERVATION · MEMBER_SOCIAL_LOGIN */
export interface PublicMemberFlags {
  enabled: boolean
  reservations: boolean
  social_login: boolean
}

export interface PublicSite {
  tenant: PublicTenant
  sections: PublicSection[]
  seo_settings: PublicSeoSettings | null
  sns_settings: PublicSnsSettings | null
  template: PublicTemplate | null
  member?: PublicMemberFlags
}

/** 회원 메뉴 · 화면을 보여줄지 — 응답에 없으면(이전 버전 캐시 등) 숨긴다 */
export const memberEnabled = (site: PublicSite | null | undefined): boolean =>
  Boolean(site?.member?.enabled)
