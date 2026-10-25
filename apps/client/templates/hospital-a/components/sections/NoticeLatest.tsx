import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'

interface NoticeItem {
  subject: string
  /** YYYY-MM-DD */
  date: string
  url?: string
}

interface Props extends CodeSectionProps {
  /** 공지 목록 페이지 주소 (T-123 에서 화면 구현) */
  listHref: string
}

const toDot = (date: string) => date.replaceAll('-', '.')

/**
 * 최신 공지 — 목업 sections/notice.html
 * 설정 키: title · description (인라인 편집) · items [{ subject, date, url }]
 * 공지 데이터는 당분간 섹션 JSON (오픈 이슈 #27)
 */
export function NoticeLatest({ section, editable, listHref }: Props) {
  const items = getJson<NoticeItem[]>(section.settings, 'items', [])

  return (
    <section className="notice" id="notice" aria-labelledby="notice-title">
      <div className="page-container notice__inner">
        <header className="notice__head">
          <TemplateText
            section={section}
            editable={editable}
            field="title"
            as="h2"
            id="notice-title"
            className="section-head__title notice__title"
            lang="en"
            maxLength={40}
          />
          <TemplateText section={section} editable={editable} field="description" as="p" className="notice__desc" maxLength={200} />
          <a className="btn btn--outline notice__more" href={listHref}>
            <span lang="en">VIEW MORE</span>
            <span className="sr-only"> 공지사항 전체 보기</span>
          </a>
        </header>

        <ul className="notice__list">
          {items.map((item, i) => (
            <li className="notice__item" key={`${item.subject}-${i}`}>
              <a className="notice__link" href={item.url || listHref}>
                <span className="notice__subject">{item.subject}</span>
                <time className="notice__date" dateTime={item.date}>
                  {toDot(item.date)}
                </time>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
