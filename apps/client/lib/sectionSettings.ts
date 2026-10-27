import { RICH_TEXT_VALUE_TYPE, richToPlainText } from './richText'
import type { PublicSettingItem } from './publicSite.types'

export function getString(
  settings: PublicSettingItem[],
  key: string,
  fallback = '',
): string {
  return settings.find((s) => s.field_key === key)?.field_value ?? fallback
}

/** 저장된 값의 형식 — 'RICH_TEXT' 면 서식 HTML (T-065-A) */
export function getValueType(settings: PublicSettingItem[], key: string): string | undefined {
  return settings.find((s) => s.field_key === key)?.value_type
}

/** 글자만 필요한 곳(빵 부스러기 · 제목 태그 등) — 서식 글이면 태그를 뺀 글자 */
export function getPlainString(
  settings: PublicSettingItem[],
  key: string,
  fallback = '',
): string {
  const item = settings.find((s) => s.field_key === key)
  if (item?.field_value == null) return fallback
  return item.value_type === RICH_TEXT_VALUE_TYPE
    ? richToPlainText(item.field_value)
    : item.field_value
}

export function getBoolean(
  settings: PublicSettingItem[],
  key: string,
  fallback = false,
): boolean {
  const raw = settings.find((s) => s.field_key === key)?.field_value
  if (raw == null) return fallback
  return raw === 'true' || raw === '1'
}

export function getJson<T>(
  settings: PublicSettingItem[],
  key: string,
  fallback: T,
): T {
  const raw = settings.find((s) => s.field_key === key)?.field_value
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
