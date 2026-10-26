import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'

/** 서브 본문 상단 소개 — 목업 sub/page-intro.html (layout=page-intro, 설정 키: eyebrow · title · description) */
export function PageIntro(props: CodeSectionProps) {
  const id = titleId('page-intro', props.section.id)
  return (
    <section className="page-intro" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} />
      </div>
    </section>
  )
}
