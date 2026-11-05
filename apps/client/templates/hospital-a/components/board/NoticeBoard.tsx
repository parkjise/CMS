import type { BodyBlock, PublicFieldValue } from '@cms/types'
import { fieldValueText } from '@/lib/publicPosts'
import { getJson, getPlainString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { BoardBody } from './BoardBody'
import { BoardEmpty, BoardListShell } from './BoardListShell'
import type { SearchTarget } from './BoardToolbar'
import { BoardViewNav } from './BoardViewNav'
import { NoticeWriteLink } from './NoticeWriteLink'
import { dotDate } from './format'

export interface NoticeItem {
  id: string
  subject: string
  /** YYYY-MM-DD */
  date: string
  pinned?: boolean
  body?: BodyBlock[]
}

export interface NoticeBoardProps extends CodeSectionProps {
  detailId?: string
  q?: string
  page: number
  /** 이 게시판 페이지의 주소 (상세 id · 검색 q · 페이지 p) */
  hrefFor: (extra?: { id?: string; q?: string; p?: number }) => string
  searchTarget: SearchTarget
}

export const NOTICE_PAGE_SIZE = 10


/** 고정 글 먼저(입력 순서), 나머지는 최신순 */
export function sortNotices(items: NoticeItem[]): NoticeItem[] {
  const pinned = items.filter((i) => i.pinned)
  const rest = items.filter((i) => !i.pinned).sort((a, b) => b.date.localeCompare(a.date))
  return [...pinned, ...rest]
}

interface NoticeDetailViewProps {
  subject: string
  date: string
  body: BodyBlock[]
  prevHref: string | null
  nextHref: string | null
  listHref: string
  /** 제목 앞 표시 — 새 게시판이면 게시판 이름 */
  badge?: string
  /** 표시할 칸 (T-142-B-2) */
  fields?: PublicFieldValue[]
  /** 실제 글이면 관리자에게 [수정] — 샘플 글에는 없음 */
  edit?: { board: string; post: string }
}

/** 게시글 상세 — 목업 sub/board-view.html */
export function NoticeDetailView({
  subject,
  date,
  body,
  prevHref,
  nextHref,
  listHref,
  badge = '공지사항',
  fields = [],
  edit,
}: NoticeDetailViewProps) {
  return (
    <section className="board-view" aria-labelledby="board-view-title">
      <div className="page-container">
        <article className="board-view__article">
          <header className="board-view__head">
            <h2 className="board-view__title" id="board-view-title">
              <span className="board-view__badge">{badge}</span>
              {subject}
            </h2>
            <time className="board-view__date" dateTime={date}>
              {dotDate(date)}
            </time>
          </header>
          {edit && <NoticeWriteLink board={edit.board} post={edit.post} />}
          {fields.length > 0 && (
            <dl className="board-view__fields">
              {fields.map((field) => (
                <div className="board-view__field" key={field.key}>
                  <dt className="board-view__field-label">{field.label}</dt>
                  <dd className="board-view__field-value">
                    {field.field_type === 'IMAGE' ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 칸 사진
                      <img src={String(field.value)} alt={field.label} loading="lazy" />
                    ) : (
                      fieldValueText(field)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <BoardBody blocks={body} />
        </article>
        <BoardViewNav prevHref={prevHref} nextHref={nextHref} listHref={listHref} />
      </div>
    </section>
  )
}

interface NoticeListViewProps {
  title: string
  items: NoticeItem[]
  total: number
  page: number
  totalPages: number
  keyword: string
  hrefFor: NoticeBoardProps['hrefFor']
  searchTarget: SearchTarget
  /** 실제 사업체 공지면 관리자에게 [글쓰기] — 샘플 미리보기에는 없음 */
  canWrite: boolean
  /** 글쓰기 · 문구 — 새 게시판이면 그 게시판 값 */
  boardSlug?: string
  description?: string
  searchLabel?: string
  emptyText?: string
}

/** 글 목록 — 목업 sub/board-list.html */
export function NoticeListView({
  title,
  items,
  total,
  page,
  totalPages,
  keyword,
  hrefFor,
  searchTarget,
  canWrite,
  boardSlug = 'notice',
  description,
  searchLabel = '공지사항 검색',
  emptyText = '등록된 공지가 없습니다.',
}: NoticeListViewProps) {
  return (
    <BoardListShell
      title={title}
      description={description}
      writeBoard={canWrite ? boardSlug : undefined}
      total={total}
      page={page}
      totalPages={totalPages}
      keyword={keyword}
      hrefFor={hrefFor}
      searchTarget={searchTarget}
      searchLabel={searchLabel}
    >
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
        <BoardEmpty keyword={keyword} emptyText={emptyText} />
      )}
    </BoardListShell>
  )
}

/**
 * 공지사항 샘플 (섹션 JSON) — 실제 글이 없을 때 · 샘플 미리보기 (게시판 모듈 기획서 2.2)
 * 설정 키: title · items [{ id, subject, date, pinned, body [블록] }]
 * 본문 블록: { type: 'p', text } (\n · **굵게**) · { type: 'ul', items } · { type: 'image', src, alt }
 */
export function NoticeBoard({ section, editable, detailId, q, page, hrefFor, searchTarget }: NoticeBoardProps) {
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
      <NoticeDetailView
        subject={item.subject}
        date={item.date}
        body={item.body ?? []}
        prevHref={prev ? hrefFor({ id: prev.id }) : null}
        nextHref={next ? hrefFor({ id: next.id }) : null}
        listHref={hrefFor()}
      />
    )
  }

  const keyword = (q ?? '').trim()
  const filtered = keyword ? all.filter((i) => i.subject.includes(keyword)) : all
  const totalPages = Math.max(1, Math.ceil(filtered.length / NOTICE_PAGE_SIZE))
  const current = Math.min(page, totalPages)

  return (
    <NoticeListView
      title={title}
      items={filtered.slice((current - 1) * NOTICE_PAGE_SIZE, current * NOTICE_PAGE_SIZE)}
      total={filtered.length}
      page={current}
      totalPages={totalPages}
      keyword={keyword}
      hrefFor={hrefFor}
      searchTarget={searchTarget}
      canWrite={editable}
    />
  )
}
