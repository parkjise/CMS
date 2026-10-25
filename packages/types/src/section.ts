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
  // 코드형 템플릿 섹션 (기획서 11.10) — 백엔드 enum 은 T-117 에서 추가
  | 'HERO_SLIDER'
  | 'VIDEO_PLAYLIST'
  | 'NOTICE_LATEST'
  | 'SUB_HERO'
  | 'CONTENT_BLOCK'
  | 'HISTORY_TIMELINE'
  | 'BOARD'

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
