import { getJson, getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'
import { optimizedImg } from '../../../shared/optimizedImage'

/**
 * 체크리스트 + 사진 — 목업 sub/strength-list.html (layout=strength-list)
 * 설정 키: eyebrow · title (인라인 편집) · items [문자열] · image_url · image_alt
 */
export function StrengthList(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('strength-list', section.id)
  const items = getJson<string[]>(section.settings, 'items', [])
  return (
    <section className="strength-list" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} sub />
        <div className="strength-list__row">
          <ul className="strength-list__items">
            {items.map((item) => (
              <li className="strength-list__item" key={item}>
                <i className="ri-check-line strength-list__icon" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <figure className="strength-list__photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
            <img className="strength-list__image" {...optimizedImg(getString(section.settings, 'image_url'), '(min-width: 1024px) 45vw, 100vw', 1200)} alt={getString(section.settings, 'image_alt')} loading="lazy" />
          </figure>
        </div>
      </div>
    </section>
  )
}
