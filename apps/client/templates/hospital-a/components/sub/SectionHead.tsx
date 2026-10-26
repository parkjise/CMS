import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'

interface Props extends CodeSectionProps {
  id: string
  /** 서브용 작은 제목 (.section-head--sub) */
  sub?: boolean
}

/** 섹션 머리 — eyebrow · title · description (목업 .section-head) */
export function SectionHead({ section, editable, id, sub = false }: Props) {
  return (
    <header className={`section-head${sub ? ' section-head--sub' : ''}`}>
      <TemplateText section={section} editable={editable} field="eyebrow" as="p" className="section-head__eyebrow" lang="en" maxLength={60} />
      <TemplateText section={section} editable={editable} field="title" as="h2" id={id} className="section-head__title" multiline maxLength={80} />
      <TemplateText section={section} editable={editable} field="description" as="p" className="section-head__desc" maxLength={200} />
    </header>
  )
}
