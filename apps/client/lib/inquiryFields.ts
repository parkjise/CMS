import { z } from 'zod'
import { publicApi } from '@/lib/api'

/** 업종별 문의 폼 칸 (T-051-A) — 정의는 백엔드 services/inquiry_fields.py */

export type InquiryFieldType = 'select' | 'multiselect' | 'text' | 'date' | 'number'

export interface InquiryFieldOption {
  value: string
  label: string
}

export interface InquiryField {
  key: string
  label: string
  type: InquiryFieldType
  options: InquiryFieldOption[]
  min: number | null
  max: number | null
  max_length: number | null
  max_selected: number | null
  placeholder: string | null
}

export interface InquiryFormConfig {
  inquiry_types: InquiryFieldOption[]
  fields: InquiryField[]
}

/** 칸 목록을 못 받아도 폼은 동작하도록 — 일반 문의만 */
export const FALLBACK_FORM_CONFIG: InquiryFormConfig = {
  inquiry_types: [{ value: 'GENERAL', label: '일반 문의' }],
  fields: [],
}

export async function fetchInquiryFields(tenantSlug: string): Promise<InquiryFormConfig> {
  const res = await publicApi.get<{ data: InquiryFormConfig }>('/inquiries/fields', {
    params: { tenant_slug: tenantSlug },
  })
  return res.data.data
}

export type DetailValues = Record<string, string | string[] | undefined>

const toArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return typeof v === 'string' && v ? [v] : []
}

const isInteger = (v: string) => /^\d+$/.test(v)

/** 폼 입력값(문자열)용 검증 — 서버가 다시 검사하므로 여기는 입력 안내용 */
export function buildDetailSchema(fields: InquiryField[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    if (f.type === 'multiselect') {
      const max = f.max_selected ?? 10
      shape[f.key] = z
        .preprocess(toArray, z.array(z.string()))
        .refine((v) => v.length <= max, `최대 ${max}개까지 선택할 수 있습니다.`)
    } else if (f.type === 'number') {
      const { min, max } = f
      shape[f.key] = z
        .string()
        .trim()
        .optional()
        .refine(
          (v) =>
            !v ||
            (isInteger(v) &&
              (min === null || Number(v) >= min) &&
              (max === null || Number(v) <= max)),
          `${min ?? 0}~${max ?? ''} 사이 숫자로 입력해주세요.`,
        )
    } else if (f.type === 'text') {
      const maxLength = f.max_length ?? 100
      shape[f.key] = z
        .string()
        .trim()
        .max(maxLength, `${maxLength}자 이하로 입력해주세요.`)
        .optional()
    } else {
      shape[f.key] = z.string().optional()
    }
  }
  return z.object(shape).superRefine((values, ctx) => {
    const checkIn = values.check_in as string | undefined
    const checkOut = values.check_out as string | undefined
    if (checkIn && checkOut && checkOut <= checkIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['check_out'],
        message: '체크아웃은 체크인 다음 날 이후여야 합니다.',
      })
    }
  })
}

export function emptyDetailValues(fields: InquiryField[]): DetailValues {
  return Object.fromEntries(fields.map((f) => [f.key, f.type === 'multiselect' ? [] : '']))
}

/** 전송용 — 빈 값은 빼고 숫자 칸은 숫자로 */
export function toDetailPayload(
  fields: InquiryField[],
  values: DetailValues | undefined,
): Record<string, string | string[] | number> {
  const payload: Record<string, string | string[] | number> = {}
  if (!values) return payload
  for (const f of fields) {
    const raw = values[f.key]
    if (f.type === 'multiselect') {
      const list = toArray(raw)
      if (list.length) payload[f.key] = list
      continue
    }
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) continue
    payload[f.key] = f.type === 'number' ? Number(value) : value
  }
  return payload
}
