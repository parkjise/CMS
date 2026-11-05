import type { PublicPostList } from '@cms/types'
import { postDate } from '@/lib/publicPosts'
import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'

interface NoticeItem {
  /** 공지 페이지(BOARD) 글 id — 있으면 상세로 연결 */
  id?: string
  subject: string
  /** YYYY-MM-DD */
  date: string
  url?: string
}

interface Props extends CodeSectionProps {
  /** 공지 목록 페이지 주소 */
  listHref: string
  /** 실제 최신 글 (T-139) — 공개 글이 있으면 샘플 대신 */
  latest?: PublicPostList | null
  /** 공지 상세 주소 */
  itemHref?: (id: string) => string
}

const toDot = (date: string) => date.replaceAll('-', '.')

/**
 * 최신 공지 — 목업 sections/notice.html
 * 설정 키: title · description (인라인 편집) · items [{ id, subject, date, url }]
 * items 는 샘플 — 공개 글이 생기면 실제 글을 보여 준다 (게시판 모듈 기획서 2.2)
 */
export function NoticeLatest({ section, editable, latest, listHref, itemHref }: Props) {
  const items: NoticeItem[] = latest?.has_posts
    ? latest.items.map((p) => ({ id: p.id, subject: p.title, date: postDate(p.published_at) }))
    : getJson<NoticeItem[]>(section.settings, 'items', [])

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
              <a
                className="notice__link"
                href={item.url || (item.id && itemHref ? itemHref(item.id) : listHref)}
              >
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
