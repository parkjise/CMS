/**
 * AI 채팅 응답의 액션을 실제 편집에 적용하는 유틸.
 * - update_text → editStore.updateField + DOM 즉시 반영
 * - update_theme → :root CSS 변수 덮어쓰기 (revert 위해 이전 값 반환)
 */
import type { AiAction } from '@/lib/aiChatStream'

type UpdateField = (
  sectionId: string,
  field: string,
  newValue: string,
  originalValue: string,
) => void

/** 텍스트 변경 액션 적용. 적용되면 true. */
export function applyTextAction(
  action: AiAction,
  updateField: UpdateField,
): boolean {
  if (
    action.action !== 'update_text' ||
    !action.section_id ||
    !action.field ||
    action.new_value == null
  ) {
    return false
  }

  const el = document.querySelector<HTMLElement>(
    `[data-section-id="${action.section_id}"][data-field="${action.field}"]`,
  )
  const original = el?.textContent ?? ''
  updateField(action.section_id, action.field, action.new_value, original)
  if (el) el.innerText = action.new_value
  return true
}

/** 테마 변경 액션 적용. 이전 CSS 변수 값 맵을 반환(되돌리기용). */
export function applyThemeAction(action: AiAction): Record<string, string> {
  const previous: Record<string, string> = {}
  if (action.action !== 'update_theme' || !action.css_overrides) {
    return previous
  }
  const root = document.documentElement
  for (const [key, value] of Object.entries(action.css_overrides)) {
    previous[key] = root.style.getPropertyValue(key)
    root.style.setProperty(key, value)
  }
  return previous
}

/** applyThemeAction이 반환한 맵으로 CSS 변수를 원복. */
export function revertTheme(previous: Record<string, string>): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(previous)) {
    if (value) {
      root.style.setProperty(key, value)
    } else {
      root.style.removeProperty(key)
    }
  }
}
