import { getJson, getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { RichLine } from './RichText'
import { titleId } from './ids'
import { optimizedImg } from '../../../shared/optimizedImage'

interface Props extends CodeSectionProps {
  /** more_page 페이지 키 → 주소 */
  hrefFor: (pageKey: string) => string
}

/**
 * 배경 사진 + 가운데 제목·설명 + 원형 가치 3개 + 더보기 — 목업 sub/value-circles.html (layout=value-circles)
 * 설정 키: en_title · sub_title · paragraphs · bg_image_url · values [문자열] · more_label ·
 *          more_page(페이지 키) + more_hash(섹션 앵커) 또는 more_url
 */
export function ValueCircles({ hrefFor, ...props }: Props) {
  const { section } = props
  const id = titleId('value-circles', section.id)
  const values = getJson<string[]>(section.settings, 'values', [])
  const moreLabel = getString(section.settings, 'more_label')
  const morePage = getString(section.settings, 'more_page')
  const moreHash = getString(section.settings, 'more_hash')
  const moreHref =
    getString(section.settings, 'more_url') ||
    (morePage ? `${hrefFor(morePage)}${moreHash ? `#${moreHash}` : ''}` : '')
  return (
    <section className="value-circles" aria-labelledby={id}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 장식용 배경 사진 */}
      <img className="value-circles__bg" {...optimizedImg(getString(section.settings, 'bg_image_url'), '100vw', 2048)} alt="" loading="lazy" />
      <div className="page-container">
        <StoryText {...props} id={id} className="story-text--center story-text--light" />
        <ul className="value-circles__list">
          {values.map((v) => (
            <li className="value-circles__item" key={v}>
              <RichLine text={v} />
            </li>
          ))}
        </ul>
        {moreLabel && moreHref && (
          <p className="value-circles__more">
            <a className="value-circles__link" href={moreHref}>
              {moreLabel}
              <span className="value-circles__arrow" aria-hidden="true" />
            </a>
          </p>
        )}
      </div>
    </section>
  )
}
