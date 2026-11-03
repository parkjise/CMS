import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'
import { TemplateImage } from '../../../shared/TemplateImage'
import { TemplateListText } from '../../../shared/TemplateListText'

interface AreaRow {
  image_url: string
  title: string
  link_url?: string
  description?: string
}

/**
 * 사진/텍스트 지그재그 — 목업 sub/area-rows.html (layout=area-rows, 짝수 행은 --reverse)
 * 설정 키: eyebrow · title (인라인 편집) · rows [{ image_url, title, link_url, description }]
 */
export function AreaRows(props: CodeSectionProps) {
  const { section, editable } = props
  const id = titleId('area-rows', section.id)
  const rows = getJson<AreaRow[]>(section.settings, 'rows', [])
  return (
    <section className="area-rows" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} sub />
        {rows.map((row, i) => (
          <div className={`area-rows__row${i % 2 === 1 ? ' area-rows__row--reverse' : ''}`} key={`${row.title}-${i}`}>
            <figure className="area-rows__photo">
              <TemplateImage section={section} editable={editable} item={{ field: 'rows', index: i }} className="area-rows__image" sizes="(min-width: 1024px) 50vw, 100vw" maxWidth={1200} alt="" loading="lazy" />
            </figure>
            <div className="area-rows__body">
              <h3 className="area-rows__title">
                <a className="area-rows__link" href={row.link_url || '#'}>
                  <TemplateListText section={section} editable={editable} field="rows" index={i} itemKey="title" maxLength={40} label={`${i + 1}번 영역 제목`} />
                </a>
              </h3>
              <TemplateListText
                section={section}
                editable={editable}
                field="rows"
                index={i}
                itemKey="description"
                as="p"
                className="area-rows__desc"
                multiline
                maxLength={300}
                label={`${i + 1}번 영역 설명`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
