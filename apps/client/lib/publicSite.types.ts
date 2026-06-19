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
}

export interface PublicSection {
  id: string
  section_type: string
  label: string
  display_order: number
  is_active: boolean
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
}

export interface PublicTemplate {
  template_type: string
  name: string
  css_variables: Record<string, string>
  section_layouts: unknown[]
}

export interface PublicSite {
  tenant: PublicTenant
  sections: PublicSection[]
  seo_settings: PublicSeoSettings | null
  sns_settings: PublicSnsSettings | null
  template: PublicTemplate | null
}
