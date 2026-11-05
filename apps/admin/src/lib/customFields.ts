import { z } from 'zod'
import type { BoardField, FieldType } from '@cms/types'

/** 칸 값 다루기 (T-142-B) — 최종 판단은 서버(services/board_field.py), 여기는 바로 알려 주는 용도 */

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXT', label: '짧은 글' },
  { value: 'TEXTAREA', label: '긴 글' },
  { value: 'NUMBER', label: '숫자' },
  { value: 'DATE', label: '날짜' },
  { value: 'SELECT', label: '하나 고르기' },
  { value: 'MULTI_SELECT', label: '여러 개 고르기' },
  { value: 'BOOLEAN', label: '예 / 아니오' },
  { value: 'RATING', label: '별점 (1~5)' },
  { value: 'IMAGE', label: '사진' },
]

export const fieldTypeLabel = (value: string): string =>
  FIELD_TYPES.find((t) => t.value === value)?.label ?? value

export const usesChoices = (type: FieldType): boolean => type === 'SELECT' || type === 'MULTI_SELECT'

export const MAX_FIELDS = 20
const TEXT_MAX = 200
const TEXTAREA_MAX = 5000
export const MSG_REQUIRED = '필수 칸입니다.'

export type CustomValues = Record<string, unknown>

export const isEmptyValue = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)

const schemaOf = (field: BoardField): z.ZodType => {
  const choices = field.options.map((o) => o.value)
  switch (field.field_type) {
    case 'TEXT':
      return z.string().max(TEXT_MAX, `${TEXT_MAX}자 이하로 입력해주세요.`)
    case 'TEXTAREA':
      return z.string().max(TEXTAREA_MAX, `${TEXTAREA_MAX}자 이하로 입력해주세요.`)
    case 'NUMBER': {
      let schema = z.coerce.number({ invalid_type_error: '올바른 숫자가 아닙니다.' })
      if (field.min !== null) schema = schema.min(field.min, `${field.min} 이상이어야 합니다.`)
      if (field.max !== null) schema = schema.max(field.max, `${field.max} 이하여야 합니다.`)
      return schema
    }
    case 'DATE':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '올바른 날짜가 아닙니다.')
    case 'SELECT':
      return z.string().refine((v) => choices.includes(v), '선택할 수 없는 값입니다.')
    case 'MULTI_SELECT':
      return z.array(z.string()).refine((v) => v.every((c) => choices.includes(c)), '선택할 수 없는 값입니다.')
    case 'BOOLEAN':
      return z.boolean()
    case 'RATING':
      return z.coerce.number().int().min(1).max(5)
    case 'IMAGE':
      return z.string().regex(/^(https?:\/\/|\/(?!\/))/i, '사진 주소가 올바르지 않습니다.')
  }
}

interface ValidateOptions {
  /** 공개로 저장하는지 — 필수 칸은 공개할 때만 본다 */
  publishing: boolean
  /** 한 번도 공개한 적 없는 글인지 — 아니면 있던 값을 비우는 것만 막는다 (기획서 8.4) */
  first: boolean
  stored: CustomValues
}

/** 칸별 오류 메시지 {field_key: 메시지} */
export function validateCustomValues(
  fields: BoardField[],
  values: CustomValues,
  { publishing, first, stored }: ValidateOptions,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const key = field.field_key
    const value = values[key]
    if (isEmptyValue(value)) {
      if (field.is_required && publishing && (first || key in stored)) errors[key] = MSG_REQUIRED
      continue
    }
    const parsed = schemaOf(field).safeParse(value)
    if (!parsed.success) errors[key] = parsed.error.issues[0]?.message ?? '값이 올바르지 않습니다.'
  }
  return errors
}

/** 서버로 보낼 값 — 빈 칸은 null 로 보내 비운다. 숫자는 입력칸이 글자라 숫자로 바꾼다 */
export function toCustomData(fields: BoardField[], values: CustomValues): CustomValues {
  return Object.fromEntries(
    fields.map(({ field_key: key, field_type: type }) => {
      const value = values[key]
      if (isEmptyValue(value)) return [key, null]
      return [key, type === 'NUMBER' || type === 'RATING' ? Number(value) : value]
    }),
  )
}

/** 폼 시작 값 — 새 글은 기본값, 고치는 글은 저장된 값 */
export function initialCustomValues(fields: BoardField[], stored: CustomValues | null): CustomValues {
  return Object.fromEntries(
    fields.map((field) => {
      const value = stored ? stored[field.field_key] : field.default_value
      if (value !== undefined && value !== null) return [field.field_key, value]
      if (field.field_type === 'MULTI_SELECT') return [field.field_key, []]
      if (field.field_type === 'BOOLEAN') return [field.field_key, null]
      return [field.field_key, '']
    }),
  )
}

/** 서버 오류의 칸 이름 — custom_data.field_1 → field_1 */
export function customFieldOfError(error: unknown): string | null {
  const field = (error as { response?: { data?: { error?: { field?: unknown } } } })?.response?.data?.error?.field
  return typeof field === 'string' && field.startsWith('custom_data.') ? field.slice('custom_data.'.length) : null
}

/** 새 선택지의 내부 값 — 이름을 바꿔도 글의 값이 그대로이도록 이름과 따로 둔다 */
export function nextOptionValue(used: string[]): string {
  let number = 1
  while (used.includes(`opt_${number}`)) number += 1
  return `opt_${number}`
}
