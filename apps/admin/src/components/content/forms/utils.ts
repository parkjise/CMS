import type { SectionSetting } from '@/hooks/useSections'
import type { SettingUpdate } from '@/hooks/useSection'

// 서식 있는 글 (홈페이지 편집 모드 미니 툴바 — T-065-A)
export const RICH_TEXT_VALUE_TYPE = 'RICH_TEXT'

/** 서식 HTML 에서 글자만 (줄바꿈은 \n) — 폼 입력칸에 보여 줄 값 */
export function richToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function isRichSetting(settings: SectionSetting[], key: string): boolean {
  return settings.find((s) => s.field_key === key)?.value_type === RICH_TEXT_VALUE_TYPE
}

/** settings 배열에서 field_key에 해당하는 값을 추출. 없으면 fallback 반환 (서식 글은 글자만) */
export function getSetting(
  settings: SectionSetting[],
  key: string,
  fallback = ''
): string {
  const item = settings.find((s) => s.field_key === key)
  if (item?.field_value == null) return fallback
  return item.value_type === RICH_TEXT_VALUE_TYPE
    ? richToPlainText(item.field_value)
    : item.field_value
}

/**
 * 폼은 글자만 다룬다 — 서식 글을 고치지 않았으면 원래 서식 HTML 을 그대로 보내 서식을 지킨다.
 * 글자를 고쳤으면 일반 글자로 저장된다 (폼에 '서식이 지워집니다' 안내).
 */
export function preserveRichText(
  original: SectionSetting[],
  updates: SettingUpdate[]
): SettingUpdate[] {
  return updates.map((u) => {
    const prev = original.find((s) => s.field_key === u.field_key)
    if (
      prev?.value_type === RICH_TEXT_VALUE_TYPE &&
      prev.field_value != null &&
      u.field_value === richToPlainText(prev.field_value)
    ) {
      return { ...u, field_value: prev.field_value, value_type: RICH_TEXT_VALUE_TYPE }
    }
    return u
  })
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
