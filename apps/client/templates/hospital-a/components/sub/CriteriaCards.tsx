import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { titleId } from './ids'
import { optimizedImg } from '../../../shared/optimizedImage'

interface Card {
  image_url: string
  title: string
  text?: string
}

/**
 * 제목 | 설명 + 사진 카드 3개 — 목업 sub/criteria-cards.html (layout=criteria-cards)
 * 설정 키: en_title · sub_title · paragraphs · cards [{ image_url, title, text }]
 */
export function CriteriaCards(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('criteria-cards', section.id)
  const cards = getJson<Card[]>(section.settings, 'cards', [])
  return (
    <section className="criteria-cards" aria-labelledby={id}>
      <div className="page-container">
        <StoryText {...props} id={id} className="story-text--split criteria-cards__head" />
        <ul className="criteria-cards__list">
          {cards.map((card) => (
            <li className="criteria-cards__item" key={card.title}>
              <figure className="criteria-cards__media">
                {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
                <img className="criteria-cards__image" {...optimizedImg(card.image_url, '(min-width: 1024px) 33vw, 100vw', 828)} alt="" loading="lazy" />
              </figure>
              <h3 className="criteria-cards__title">{card.title}</h3>
              {card.text && <p className="criteria-cards__text">{card.text}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
