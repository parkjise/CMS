import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateListText } from '../../../shared/TemplateListText'
import { TemplateText } from '../../../shared/TemplateText'

interface Props extends CodeSectionProps {
  id: string
  className?: string
  as?: 'h2' | 'h3'
}

/**
 * 큰 영문 제목 + 국문 소제목 + 설명 문단 — 목업 .story-text (split-story · milestone · banner · criteria · value 공용)
 * 설정 키: en_title · sub_title (인라인 편집) · paragraphs [문단] (**굵게**, \n 줄바꿈 — 인라인 편집, T-125-I)
 */
export function StoryText({ section, editable, id, className, as = 'h2' }: Props) {
  const paragraphs = getJson<string[]>(section.settings, 'paragraphs', [])
  const Heading = as
  return (
    <div className={['story-text', className].filter(Boolean).join(' ')}>
      <Heading className="story-text__title" id={id}>
        <TemplateText section={section} editable={editable} field="en_title" className="story-text__en" multiline lang="en" maxLength={60} block />
        <TemplateText section={section} editable={editable} field="sub_title" className="story-text__sub" multiline maxLength={80} block />
      </Heading>
      {paragraphs.length > 0 && (
        <div className="story-text__desc">
          {paragraphs.map((_, i) => (
            <TemplateListText
              key={i}
              section={section}
              editable={editable}
              field="paragraphs"
              index={i}
              as="p"
              multiline
              boldMarks
              maxLength={600}
              label={`${i + 1}번 문단`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
