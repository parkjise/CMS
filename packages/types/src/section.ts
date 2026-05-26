export type SectionType =
  | 'HERO_BANNER'
  | 'INTRO'
  | 'SERVICES'
  | 'GALLERY'
  | 'RESERVATION'
  | 'CONTACT'
  | 'MAP'
  | 'PORTFOLIO'
  | 'TEAM'
  | 'FAQ'

export type SectionValueType = 'STRING' | 'INTEGER' | 'BOOLEAN' | 'JSON' | 'URL'

export interface SectionSetting {
  id: string
  section_id: string
  tenant_id: string
  setting_key: string
  setting_value: string | null
  value_type: SectionValueType
  updated_at: string
}

export interface Section {
  id: string
  tenant_id: string
  section_type: SectionType
  label: string
  display_order: number
  is_active: boolean
  settings: SectionSetting[]
  created_at: string
  updated_at: string
}

export interface SectionReorderItem {
  id: string
  order: number
}

export interface SectionUpdate {
  label?: string
  is_active?: boolean
  settings?: Array<{
    setting_key: string
    setting_value: string | null
    value_type?: SectionValueType
  }>
}
