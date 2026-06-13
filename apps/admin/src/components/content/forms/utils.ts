import type { SectionSetting } from '@/hooks/useSections'
import type { SettingUpdate } from '@/hooks/useSection'

/** settings 배열에서 field_key에 해당하는 값을 추출. 없으면 fallback 반환 */
export function getSetting(
  settings: SectionSetting[],
  key: string,
  fallback = ''
): string {
  return settings.find((s) => s.field_key === key)?.field_value ?? fallback
}

export function getJsonSetting<T>(
  settings: SectionSetting[],
  key: string,
  fallback: T
): T {
  const raw = settings.find((s) => s.field_key === key)?.field_value
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** STRING 타입 setting update 생성 헬퍼 */
export function strSetting(key: string, value: string): SettingUpdate {
  return { field_key: key, field_value: value, value_type: 'STRING' }
}

export function urlSetting(key: string, value: string): SettingUpdate {
  return { field_key: key, field_value: value, value_type: 'URL' }
}

export function jsonSetting<T>(key: string, value: T): SettingUpdate {
  return { field_key: key, field_value: JSON.stringify(value), value_type: 'JSON' }
}
