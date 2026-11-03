import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { titleId } from './ids'
import { TemplateImage } from '../../../shared/TemplateImage'
import { TemplateListText } from '../../../shared/TemplateListText'

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
  const { section, editable } = props
  const id = titleId('criteria-cards', section.id)
  const cards = getJson<Card[]>(section.settings, 'cards', [])
  return (
    <section className="criteria-cards" aria-labelledby={id}>
      <div className="page-container">
        <StoryText {...props} id={id} className="story-text--split criteria-cards__head" />
        <ul className="criteria-cards__list">
          {cards.map((card, i) => (
            <li className="criteria-cards__item" key={card.title}>
              <figure className="criteria-cards__media">
                <TemplateImage section={section} editable={editable} item={{ field: 'cards', index: i }} className="criteria-cards__image" sizes="(min-width: 1024px) 33vw, 100vw" maxWidth={828} alt="" loading="lazy" />
              </figure>
              <TemplateListText section={section} editable={editable} field="cards" index={i} itemKey="title" as="h3" className="criteria-cards__title" maxLength={40} label={`${i + 1}번 카드 제목`} />
              <TemplateListText
                section={section}
                editable={editable}
                field="cards"
                index={i}
                itemKey="text"
                as="p"
                className="criteria-cards__text"
                multiline
                maxLength={300}
                label={`${i + 1}번 카드 본문`}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
