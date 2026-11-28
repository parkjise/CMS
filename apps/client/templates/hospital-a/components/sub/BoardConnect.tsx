import type { PublicBoard, PublicSectionPost } from '@cms/types'
import { CONNECT_MAX_COUNT, connectOptions, latestBoard, latestCount } from '@/lib/latestBoard'
import { boardPageKey, fetchSectionPosts, fieldValueText, postDate } from '@/lib/publicPosts'
import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { RichBody } from '../../../shared/RichBody'
import { TemplateText } from '../../../shared/TemplateText'
import { dotDate } from '../board/format'
import { titleId } from './ids'

const DEFAULT_COUNT = 5
/** 연혁의 연도 칸 — 콘텐츠형 '연혁' 프리셋이 만든다. 없으면 공개일의 해 */
const YEAR_FIELD = 'year'

interface Props extends CodeSectionProps {
  boards?: PublicBoard[]
  /** 게시판 페이지 · 글 주소 — 템플릿이 미리보기 · 고객 도메인을 맞춰 만든다 */
  hrefFor: (pageKey: string, id?: string) => string
}

const fieldsOf = (post: PublicSectionPost): string =>
  post.fields
    .filter((f) => f.key !== YEAR_FIELD)
    .map(fieldValueText)
    .join(' · ')

const yearOf = (post: PublicSectionPost): string => {
  const year = post.fields.find((f) => f.key === YEAR_FIELD)
  return year ? fieldValueText(year) : postDate(post.published_at).slice(0, 4)
}

/**
 * 게시판 연결 (BOARD_LATEST) — hospital-a 디자인 (T-264, 페이지 기획서 PM-04 · T-243).
 * 데이터 · 칸 · 동작은 테마형(components/sections/BoardLatest)과 같고 화면만 템플릿 BEM + SCSS.
 * 목록 = 공지 목록(board-list), 카드 = 갤러리형(board-gallery), FAQ = FAQ형(board-faq),
 * 연혁 = 콘텐츠 연결과 같은 content-list 연혁. 비밀글 · 회원 전용 게시판 글은 서버가 보내지 않는다.
 */
export async function BoardConnect({ section, tenantSlug, editable, boards, hrefFor }: Props) {
  const board = latestBoard(section, boards)
  if (!board) return null
  const { mode, sort, category, emptyText } = connectOptions(section)
  const posts = await fetchSectionPosts(tenantSlug, board.slug, {
    size: latestCount(section, DEFAULT_COUNT, CONNECT_MAX_COUNT),
    sort,
    category,
    body: mode === 'FAQ',
  })
  if (!posts || (!posts.length && !emptyText)) return null

  const key = boardPageKey(board.slug)
  const id = titleId('board-connect', section.id)
  const title = getString(section.settings, 'section_title')

  return (
    <section
      className={`content-list content-list--${mode.toLowerCase()}`}
      data-section-id={section.id}
      data-section-type="BOARD_LATEST"
      aria-labelledby={title ? id : undefined}
    >
      <div className="page-container">
        {(title || editable) && (
          <header className="section-head section-head--sub">
            <TemplateText
              section={section}
              editable={editable}
              field="section_title"
              as="h2"
              id={id}
              className="section-head__title"
              maxLength={40}
            />
          </header>
        )}

        {!posts.length ? (
          <p className="content-list__empty">{emptyText}</p>
        ) : mode === 'CARD' ? (
          <ul className="board-gallery board-gallery--cols-3">
            {posts.map((post) => (
              <li className="board-gallery__item" key={post.id}>
                <a className="board-gallery__link" href={hrefFor(key, post.id)}>
                  {post.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                    <img className="board-gallery__image" src={post.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="board-gallery__image board-gallery__image--empty" aria-hidden="true" />
                  )}
                  <span className="board-gallery__subject">{post.title}</span>
                  {fieldsOf(post) && <span className="board-gallery__fields">{fieldsOf(post)}</span>}
                  {post.summary && <span className="content-list__summary">{post.summary}</span>}
                </a>
              </li>
            ))}
          </ul>
        ) : mode === 'FAQ' ? (
          <div className="board-faq">
            {posts.map((post) => (
              <details className="board-faq__item" key={post.id}>
                <summary className="board-faq__question">
                  <span className="board-faq__heading">{post.title}</span>
                </summary>
                <div className="board-faq__answer">
                  <RichBody nodes={post.body ?? []} />
                </div>
              </details>
            ))}
          </div>
        ) : mode === 'TIMELINE' ? (
          <ol className="content-list__timeline">
            {posts.map((post) => (
              <li className="content-list__event" key={post.id}>
                <span className="content-list__when">{yearOf(post)}</span>
                <span className="content-list__event-body">
                  <strong className="content-list__event-title">{post.title}</strong>
                  {fieldsOf(post) && <span className="content-list__fields">{fieldsOf(post)}</span>}
                  {post.summary && <span className="content-list__summary">{post.summary}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <ul className="board-list__list">
              {posts.map((post) => (
                <li className="board-list__item" key={post.id}>
                  <a className="board-list__link" href={hrefFor(key, post.id)}>
                    <span className="board-list__content">
                      <span className="board-list__subject">{post.title}</span>
                      {fieldsOf(post) && <span className="board-list__fields">{fieldsOf(post)}</span>}
                    </span>
                    <time className="board-list__date" dateTime={postDate(post.published_at)}>
                      {dotDate(post.published_at)}
                    </time>
                  </a>
                </li>
              ))}
            </ul>
            <p className="content-list__more">
              <a className="content-list__more-link" href={hrefFor(key)}>
                전체 보기<span className="sr-only"> — {board.name}</span>
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  )
}
