import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'
import { optimizedImg } from '../../../shared/optimizedImage'

/**
 * 사진 + 제목·설명 가로 배치 — 목업 sub/media-row.html (layout=media-row)
 * 설정 키: eyebrow · title · description · body_title · body_text (인라인 편집) · image_url · image_alt
 */
export function MediaRow(props: CodeSectionProps) {
  const { section, editable } = props
  const id = titleId('media-row', section.id)
  return (
    <section className="media-row" aria-labelledby={id}>
      <SectionHead {...props} id={`${id}-head`} />
      <div className="page-container media-row__inner">
        <figure className="media-row__photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
          <img className="media-row__image" {...optimizedImg(getString(section.settings, 'image_url'), '(min-width: 1024px) 50vw, 100vw', 1200)} alt={getString(section.settings, 'image_alt')} loading="lazy" />
        </figure>
        <div className="media-row__body">
          <TemplateText section={section} editable={editable} field="body_title" as="h3" id={id} className="media-row__title" multiline maxLength={80} />
          <TemplateText section={section} editable={editable} field="body_text" as="p" className="media-row__text" multiline maxLength={400} />
        </div>
      </div>
    </section>
  )
}
