import type { FieldInput } from '@/hooks/useBoardFields'
import type { SuggestedField } from '@/lib/aiAssist'
import { nextOptionValue, usesChoices } from '@/lib/customFields'

/** 게시판 구성 추천 적용 (기획서 A-2, T-232-A) — 이름이 같은 필드 · 카테고리는 건너뛴다 */

/** 띄어쓰기 · 대소문자만 다른 이름은 같은 것으로 본다 */
export const sameName = (name: string) => name.replace(/\s+/g, '').toLowerCase()

/** 이미 있는 이름과 겹치지 않는 것만 — 추천 안에서 겹친 것도 하나만 남긴다 */
export function withoutTaken<T>(items: T[], nameOf: (item: T) => string, taken: string[]): T[] {
  const seen = new Set(taken.map(sameName))
  return items.filter((item) => {
    const key = sameName(nameOf(item))
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 추천 칸 → 칸 만들기 요청 — 고르기 칸의 선택지 값은 칸 설정 화면과 같은 opt_N */
export function toFieldInput(field: SuggestedField): FieldInput {
  if (!usesChoices(field.field_type)) return { label: field.label, field_type: field.field_type }
  const options: { value: string; label: string }[] = []
  for (const label of field.choices) {
    options.push({ value: nextOptionValue(options.map((o) => o.value)), label })
  }
  return { label: field.label, field_type: field.field_type, options }
}
