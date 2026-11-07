import type { PublicFieldValue } from '@cms/types'
import { fieldValueText } from '@/lib/publicPosts'

interface ListFieldValuesProps {
  fields?: PublicFieldValue[] | null
  className: string
  itemClassName: string
}

/** 목록의 추가 정보 — 중첩 링크나 외부 이미지 요청 없이 글자로 표시한다. */
export const ListFieldValues = ({ fields, className, itemClassName }: ListFieldValuesProps) => {
  if (!fields?.length) return null
  return (
    <span className={className}>
      {fields.map((field) => (
        <span key={field.key} className={itemClassName}>
          {field.label}: {field.field_type === 'IMAGE' ? '사진 있음' : fieldValueText(field)}
        </span>
      ))}
    </span>
  )
}
