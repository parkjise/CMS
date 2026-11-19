/** 사이트 기본정보 확장 (T-222, 사이트 관리 기획서 SM-01) */

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** open: 시각대로 / closed: 휴무 / 24h: 24시간 */
export type DayStatus = 'open' | 'closed' | '24h'

/** 하루 운영시간 — 닫는 시각이 여는 시각보다 이르면 다음 날 새벽에 닫는다 */
export interface DayHours {
  status: DayStatus
  open: string | null
  close: string | null
  break_start: string | null
  break_end: string | null
}

/** 정하지 않은 요일은 빠진다. 비어 있으면 예전 자유 글자(hours_weekday · hours_saturday) */
export type WeeklyHours = Partial<Record<WeekdayKey, DayHours>>

/** 공개 항목 묶음 — 숨기면 공개 API · 홈페이지 · 구조화 데이터에서 모두 빠진다 */
export type PublicFieldGroup =
  | 'company_name'
  | 'ceo'
  | 'address'
  | 'phone'
  | 'fax'
  | 'email'
  | 'business'
  | 'privacy_officer'

/** 관리자 · 홈페이지가 같이 쓰는 기본정보 칸 */
export interface SiteInfoFields {
  site_name: string | null
  company_name: string | null
  phone: string | null
  cs_phone: string | null
  fax: string | null
  email: string | null
  postal_code: string | null
  address: string | null
  address_detail: string | null
  hours_weekday: string | null
  hours_saturday: string | null
  hours_note: string | null
  hours_temp_note: string | null
  weekly_hours: WeeklyHours | null
  parking: string | null
  ceo: string | null
  business_number: string | null
  mail_order_number: string | null
  business_type: string | null
  business_item: string | null
  privacy_officer: string | null
  privacy_email: string | null
  copyright: string | null
  logo_url: string | null
  favicon_url: string | null
}
