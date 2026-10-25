import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'

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
  const { section } = props
  const id = titleId('area-rows', section.id)
  const rows = getJson<AreaRow[]>(section.settings, 'rows', [])
  return (
    <section className="area-rows" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} sub />
        {rows.map((row, i) => (
          <div className={`area-rows__row${i % 2 === 1 ? ' area-rows__row--reverse' : ''}`} key={`${row.title}-${i}`}>
            <figure className="area-rows__photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
              <img className="area-rows__image" src={row.image_url} alt="" loading="lazy" />
            </figure>
            <div className="area-rows__body">
              <h3 className="area-rows__title">
                <a className="area-rows__link" href={row.link_url || '#'}>
                  {row.title}
                </a>
              </h3>
              {row.description && <p className="area-rows__desc">{row.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
