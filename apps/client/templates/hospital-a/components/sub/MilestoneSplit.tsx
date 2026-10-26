import { getJson, getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { RichLine } from './RichText'
import { titleId } from './ids'
import { optimizedImg } from '../../../shared/optimizedImage'

interface Milestone {
  year: string
  text: string
}

/**
 * 제목·사진 | 사진·주요 연도 — 목업 sub/milestone-split.html (layout=milestone-split)
 * 설정 키: en_title · sub_title · paragraphs · left_image_url/alt · right_image_url/alt · milestones [{ year, text }]
 */
export function MilestoneSplit(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('milestone-split', section.id)
  const milestones = getJson<Milestone[]>(section.settings, 'milestones', [])
  const s = (key: string) => getString(section.settings, key)
  return (
    <section className="milestone-split" aria-labelledby={id}>
      <div className="page-container milestone-split__inner">
        <div className="milestone-split__col milestone-split__col--left">
          <StoryText {...props} id={id} />
          <figure className="milestone-split__media">
            {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
            <img className="milestone-split__image" {...optimizedImg(s('left_image_url'), '(min-width: 1024px) 40vw, 100vw', 1200)} alt={s('left_image_alt')} loading="lazy" />
          </figure>
        </div>
        <div className="milestone-split__col milestone-split__col--right">
          <figure className="milestone-split__media">
            {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
            <img className="milestone-split__image" {...optimizedImg(s('right_image_url'), '(min-width: 1024px) 40vw, 100vw', 1200)} alt={s('right_image_alt')} loading="lazy" />
          </figure>
          <ol className="milestone-split__list">
            {milestones.map((m) => (
              <li className="milestone-split__item" key={`${m.year}-${m.text}`}>
                <p className="milestone-split__year">
                  <time dateTime={m.year}>{m.year}</time>,
                </p>
                <p className="milestone-split__text">
                  <RichLine text={m.text} />
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
