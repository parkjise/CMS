import type { PublicFieldValue } from '@cms/types'
import { fieldValueHref, fieldValueText } from '@/lib/publicPosts'

/** 칸 값 글자 — 연락처 · 이메일 · 링크는 누를 수 있게. 코드형 · 테마형이 같이 쓴다 (T-147) */
export function FieldValue({ field }: { field: PublicFieldValue }) {
  const text = fieldValueText(field)
  const href = fieldValueHref(field)
  if (!href) return <>{text}</>
  return field.field_type === 'URL' ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
      {text}
    </a>
  ) : (
    <a href={href} className="underline">
      {text}
    </a>
  )
}
