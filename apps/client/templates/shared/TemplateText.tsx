import { EditableText } from '@/components/edit/EditableText'
import { getString } from '@/lib/sectionSettings'
import type { PublicSection } from '@/lib/publicSite.types'

type Tag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div'

interface Props {
  section: PublicSection
  editable: boolean
  field: string
  as?: Tag
  className?: string
  maxLength?: number
  multiline?: boolean
  lang?: string
}

/**
 * 템플릿 글자 출력 — 편집 가능한 섹션이면 EditableText, 샘플 섹션이면 일반 태그.
 * 줄바꿈(\n)은 템플릿 스타일의 white-space: pre-line 으로 표시한다 (.u-pre-line).
 */
export function TemplateText({
  section,
  editable,
  field,
  as = 'span',
  className,
  maxLength,
  multiline = false,
  lang,
}: Props) {
  const value = getString(section.settings, field)
  if (!value) return null

  const classes = [className, multiline ? 'u-pre-line' : null].filter(Boolean).join(' ')

  if (editable) {
    return (
      <EditableText
        as={as}
        sectionId={section.id}
        field={field}
        initialValue={value}
        maxLength={maxLength}
        multiline={multiline}
        className={classes}
      />
    )
  }

  const Tag = as
  return (
    <Tag className={classes} lang={lang}>
      {value}
    </Tag>
  )
}
