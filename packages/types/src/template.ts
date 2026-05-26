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

export interface TemplateApplyRequest {
  template_id: string
  preserve_content: true
}

export interface CSSOverrideUpdate {
  css_overrides: Partial<CSSVariableSet>
}
