import { getJson, getPlainString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { RichLine } from '../sub/RichText'
import { BoardToolbar, type SearchTarget } from './BoardToolbar'
import { BoardViewNav } from './BoardViewNav'
import { Pagination } from './Pagination'
import { dotDate } from './format'

type BodyBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'image'; src: string; alt: string }

export interface NoticeItem {
  id: string
  subject: string
  /** YYYY-MM-DD */
  date: string
  pinned?: boolean
  body?: BodyBlock[]
}

interface Props extends CodeSectionProps {
  detailId?: string
  q?: string
  page: number
  /** 이 게시판 페이지의 주소 (상세 id · 검색 q · 페이지 p) */
  hrefFor: (extra?: { id?: string; q?: string; p?: number }) => string
  searchTarget: SearchTarget
}

const PAGE_SIZE = 10

/** 고정 글 먼저(입력 순서), 나머지는 최신순 */
export function sortNotices(items: NoticeItem[]): NoticeItem[] {
  const pinned = items.filter((i) => i.pinned)
  const rest = items.filter((i) => !i.pinned).sort((a, b) => b.date.localeCompare(a.date))
  return [...pinned, ...rest]
}

/**
 * 공지사항 — 목업 sub/board-list.html · board-view.html (BOARD board=notice)
 * 공지 데이터는 섹션 JSON (오픈 이슈 #27): title · items [{ id, subject, date, pinned, body [블록] }]
 * 본문 블록: { type: 'p', text } (\n · **굵게**) · { type: 'ul', items } · { type: 'image', src, alt }
 */
export function NoticeBoard({ section, detailId, q, page, hrefFor, searchTarget }: Props) {
  const title = getPlainString(section.settings, 'title')
  const all = sortNotices(getJson<NoticeItem[]>(section.settings, 'items', []))

  if (detailId) {
    const index = all.findIndex((i) => i.id === detailId)
    const item = all[index]
    if (!item) {
      return (
        <section className="board-list" aria-label="공지사항">
          <div className="page-container">
            <p className="board-list__empty">게시글을 찾을 수 없습니다.</p>
          </div>
        </section>
      )
    }
    const prev = all[index + 1]
    const next = all[index - 1]
    return (
      <section className="board-view" aria-labelledby="board-view-title">
        <div className="page-container">
          <article className="board-view__article">
            <header className="board-view__head">
              <h2 className="board-view__title" id="board-view-title">
                <span className="board-view__badge">공지사항</span>
                {item.subject}
              </h2>
              <time className="board-view__date" dateTime={item.date}>
                {dotDate(item.date)}
              </time>
            </header>
            <div className="board-view__content">
              {(item.body ?? []).map((block, i) => {
                if (block.type === 'image') {
                  return (
                    <figure key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 공지 본문 이미지 */}
                      <img src={block.src} alt={block.alt} />
                    </figure>
                  )
                }
                if (block.type === 'ul') {
                  return (
                    <ul key={i}>
                      {block.items.map((li) => (
                        <li key={li}>{li}</li>
                      ))}
                    </ul>
                  )
                }
                return (
                  <p key={i}>
                    <RichLine text={block.text} />
                  </p>
                )
              })}
            </div>
          </article>
          <BoardViewNav
            prevHref={prev ? hrefFor({ id: prev.id }) : null}
            nextHref={next ? hrefFor({ id: next.id }) : null}
            listHref={hrefFor()}
          />
        </div>
      </section>
    )
  }

  const keyword = (q ?? '').trim()
  const filtered = keyword ? all.filter((i) => i.subject.includes(keyword)) : all
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const items = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  return (
    <section className="board-list" aria-labelledby="board-list-title">
      <div className="page-container">
        <h2 className="board-list__title" id="board-list-title">
          {title}
        </h2>
        <BoardToolbar
          total={filtered.length}
          q={keyword}
          label="공지사항 검색"
          inputId="board-search"
          target={searchTarget}
          className="board-list__toolbar"
        />
        {items.length > 0 ? (
          <ul className="board-list__list">
            {items.map((item) => (
              <li
                className={`board-list__item${item.pinned ? ' board-list__item--pinned' : ''}`}
                key={item.id}
              >
                <a className="board-list__link" href={hrefFor({ id: item.id })}>
                  {item.pinned && <span className="board-list__badge">공지</span>}
                  <span className="board-list__subject">{item.subject}</span>
                  <time className="board-list__date" dateTime={item.date}>
                    {dotDate(item.date)}
                  </time>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="board-list__list" />
            <p className="board-list__empty">{keyword ? '검색 결과가 없습니다.' : '등록된 공지가 없습니다.'}</p>
          </>
        )}
        <Pagination
          page={current}
          totalPages={totalPages}
          hrefFor={(p) => hrefFor({ q: keyword || undefined, p })}
          className="board-list__pagination"
        />
      </div>
    </section>
  )
}
