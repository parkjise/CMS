import { ListFieldValues } from '@/components/board/ListFieldValues'
import type { ReactNode } from 'react'
import type { PublicBoard, PublicPost } from '@cms/types'
import {
  type BoardPage,
  EDIT_PAGE,
  SECRET_TEXT,
  WRITE_PAGE,
  boardDesign,
  canMemberWrite,
  reviewRating,
} from '@/lib/boardRoute'
import { fieldValueText, postDate } from '@/lib/publicPosts'
import { BoardBody } from './BoardBody'
import { BoardCategoryTabs } from './BoardCategoryTabs'
import { BoardEmpty, BoardListShell } from './BoardListShell'
import type { SearchTarget } from './BoardToolbar'
import { dotDate } from './format'
import { GuestPostActions, ReportButton } from './GuestPostTools'
import { MemberPostActions } from './MemberPostActions'
import { SecretNotice } from './SecretNotice'
import { NoticeDetailView, NoticeListView } from './NoticeBoard'

export type BoardHrefFor = (extra?: { id?: string; q?: string; p?: number; c?: string }) => string

/** 브라우저에서 주소를 다시 만들 때 쓰는 값 — 함수는 클라이언트 컴포넌트로 넘길 수 없다 */
export interface BoardLink {
  pageKey: string
  previewQuery?: string
  noSlug?: boolean
}

const EMPTY_TEXT = '등록된 글이 없습니다.'

/** 문의형 관리자 답변 (T-219) — 상담 상세(ConsultPostView)와 같은 답변 상자 */
function QnaAnswer({ post }: { post: PublicPost }) {
  const date = post.answered_at ? postDate(post.answered_at) : null
  return (
    <section className="board-view__answer" aria-labelledby="board-view-answer-title">
      <header className="board-view__answer-head">
        <h3 className="board-view__answer-title" id="board-view-answer-title">
          <span className="board-view__answer-mark" aria-hidden="true">
            A
          </span>
          답변
        </h3>
        {date && (
          <time className="board-view__answer-date" dateTime={date}>
            {dotDate(date)}
          </time>
        )}
      </header>
      <div className="board-view__content board-view__content--answer">
        {(post.answer ?? '').split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}

/** 글 상세 — 없는 글이면 안내 */
export function CustomBoardDetail({
  board,
  post,
  hrefFor,
  tenantSlug,
  secretActions,
}: {
  board: PublicBoard
  post: PublicPost | null
  hrefFor: BoardHrefFor
  tenantSlug: string
  /** 잠긴 비밀글 안내를 바꿔 끼운다 — 비회원 비밀글은 비밀번호 칸 (T-151-B) */
  secretActions?: ReactNode
}) {
  if (!post) return <BoardMessage board={board} text="게시글을 찾을 수 없습니다." />
  const editHref = hrefFor({ id: `${post.id}/${EDIT_PAGE}` })
  return (
    <NoticeDetailView
      badge={board.name}
      subject={post.title}
      date={postDate(post.published_at)}
      body={post.body}
      fields={post.fields}
      attachments={post.locked ? [] : post.attachments}
      afterBody={!post.locked && post.answer ? <QnaAnswer post={post} /> : null}
      edit={{ board: board.slug, post: post.id }}
      prevHref={post.prev_id ? hrefFor({ id: post.prev_id }) : null}
      nextHref={post.next_id ? hrefFor({ id: post.next_id }) : null}
      listHref={hrefFor()}
      actions={
        post.locked ? (
          (secretActions ?? <SecretNotice tenantSlug={tenantSlug} />)
        ) : (
          <>
            {canMemberWrite(board) && post.is_guest && (
              <GuestPostActions
                board={board}
                tenantSlug={tenantSlug}
                postId={post.id}
                editHref={editHref}
                listHref={hrefFor()}
              />
            )}
            {canMemberWrite(board) && !post.is_guest && (
              <MemberPostActions
                board={board}
                tenantSlug={tenantSlug}
                postId={post.id}
                editHref={editHref}
                listHref={hrefFor()}
              />
            )}
            <ReportButton board={board} tenantSlug={tenantSlug} postId={post.id} />
          </>
        )
      }
    />
  )
}

/** 목록 칸에 안내 한 줄 — 없는 글 · 불러오기 실패 */
export function BoardMessage({ board, text }: { board: PublicBoard; text: string }) {
  return (
    <section className="board-list" aria-label={board.name}>
      <div className="page-container">
        <p className="board-list__empty">{text}</p>
      </div>
    </section>
  )
}

interface CustomBoardListProps {
  board: PublicBoard
  list: BoardPage
  hrefFor: BoardHrefFor
  searchTarget: SearchTarget
}

/** 유형별 글 목록 — 서버(공개 게시판)와 브라우저(회원 게시판)가 같이 쓴다 */
export function CustomBoardList({ board, list, hrefFor, searchTarget }: CustomBoardListProps) {
  const { posts, total, page: current, totalPages, keyword, category, ratingSummary } = list
  // 검색 · 페이지 이동은 고른 카테고리 안에서 (T-149)
  const listHref: BoardHrefFor = (extra) => hrefFor(extra?.id ? extra : { ...extra, c: category })
  const listSearch: SearchTarget = category
    ? { ...searchTarget, hidden: [...searchTarget.hidden, ['c', category]] }
    : searchTarget
  const tabs = (
    <BoardCategoryTabs
      categories={board.categories ?? []}
      current={category}
      hrefFor={(id) => hrefFor({ c: id })}
    />
  )
  const memberWriteHref = canMemberWrite(board) ? hrefFor({ id: WRITE_PAGE }) : undefined
  const searchLabel = `${board.name} 검색`
  const design = boardDesign(board)
  const ratioClass = `--ratio-${design.image_ratio.replace(':', '-')}`

  // 문의형(T-219)은 목록형 화면에 답변 상태 배지를 더한다
  if (board.board_type === 'LIST' || board.board_type === 'QNA') {
    return (
      <NoticeListView
        title={board.name}
        hideTitle
        description={board.description}
        boardSlug={board.slug}
        searchLabel={searchLabel}
        emptyText={EMPTY_TEXT}
        items={posts.map((p) => ({
          id: p.id,
          subject: p.title,
          date: postDate(p.published_at),
          pinned: p.is_pinned,
          secret: p.is_secret,
          attachment: p.has_attachments,
          answered: p.answered,
          listFields: p.list_fields,
        }))}
        total={total}
        page={current}
        totalPages={totalPages}
        keyword={keyword}
        hrefFor={listHref}
        searchTarget={listSearch}
        canWrite
        showDate={design.show_date}
        tableColumns={
          board.board_type === 'LIST' && design.list_layout === 'columns'
            ? list.list_columns
            : undefined
        }
        tabs={tabs}
        memberWriteHref={memberWriteHref}
      />
    )
  }

  return (
    <BoardListShell
      title={board.name}
      hideTitle
      description={board.description}
      writeBoard={board.slug}
      total={total}
      page={current}
      totalPages={totalPages}
      keyword={keyword}
      hrefFor={listHref}
      searchTarget={listSearch}
      searchLabel={searchLabel}
      tabs={tabs}
      memberWriteHref={memberWriteHref}
    >
      {posts.length === 0 ? (
        <BoardEmpty keyword={keyword} emptyText={EMPTY_TEXT} />
      ) : board.board_type === 'GALLERY' ? (
        <ul
          className={`board-gallery board-gallery--cols-${design.columns} board-gallery${ratioClass}`}
        >
          {posts.map((post) => {
            const date = postDate(post.published_at)
            return (
              <li className="board-gallery__item" key={post.id}>
                <a className="board-gallery__link" href={hrefFor({ id: post.id })}>
                  {post.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                    <img
                      className="board-gallery__image"
                      src={post.thumbnail}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="board-gallery__image board-gallery__image--empty"
                      aria-hidden="true"
                    />
                  )}
                  {post.is_pinned && <span className="board-gallery__badge">공지</span>}
                  <span className="board-gallery__subject">
                    {post.is_secret && (
                      <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />
                    )}
                    {post.title}
                  </span>
                  {!post.is_secret && (
                    <ListFieldValues
                      fields={post.list_fields}
                      className="board-gallery__fields"
                      itemClassName="board-gallery__field"
                    />
                  )}
                  {design.show_date && (
                    <time className="board-gallery__date" dateTime={date}>
                      {dotDate(date)}
                    </time>
                  )}
                </a>
              </li>
            )
          })}
        </ul>
      ) : board.board_type === 'REVIEW' ? (
        // 리뷰형 (T-218) — 평균 별점 · 후기 수, 글마다 별 · 제목 · 요약
        <div className="board-review">
          {ratingSummary && ratingSummary.count > 0 && (
            <p className="board-review__summary">
              <span className="board-review__average" aria-hidden="true">
                ★ {ratingSummary.average.toFixed(1)}
              </span>
              <span className="board-review__count">
                <span className="sr-only">평균 별점 {ratingSummary.average.toFixed(1)}점, </span>
                후기 {ratingSummary.count.toLocaleString()}개
              </span>
            </p>
          )}
          <ul className="board-review__list">
            {posts.map((post) => {
              const date = postDate(post.published_at)
              const { rating, rest } = reviewRating(post.list_fields)
              return (
                <li className="board-review__item" key={post.id}>
                  <a className="board-review__link" href={hrefFor({ id: post.id })}>
                    {rating !== null && (
                      <span className="board-review__stars" role="img" aria-label={`별점 ${rating}점`}>
                        {'★'.repeat(rating)}
                        <span className="board-review__stars-off">{'★'.repeat(5 - rating)}</span>
                      </span>
                    )}
                    <span className="board-review__subject">
                      {post.is_secret && (
                        <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />
                      )}
                      {post.title}
                    </span>
                    {design.show_summary && post.summary && (
                      <span className="board-review__summary-text">{post.summary}</span>
                    )}
                    {!post.is_secret && (
                      <ListFieldValues
                        fields={rest}
                        className="board-review__fields"
                        itemClassName="board-review__field"
                      />
                    )}
                    {design.show_date && (
                      <time className="board-review__date" dateTime={date}>
                        {dotDate(date)}
                      </time>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ) : board.board_type === 'WEBZINE' ? (
        // 웹진형 (T-217) — 왼쪽 썸네일, 오른쪽 제목 · 요약 · 작성일
        <ul className={`board-webzine board-webzine${ratioClass}`}>
          {posts.map((post) => {
            const date = postDate(post.published_at)
            return (
              <li className="board-webzine__item" key={post.id}>
                <a className="board-webzine__link" href={hrefFor({ id: post.id })}>
                  {design.show_image &&
                    (post.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                      <img className="board-webzine__image" src={post.thumbnail} alt="" loading="lazy" />
                    ) : (
                      // 사진 없는 글은 빈 칸 — 줄 맞춤 (D-03)
                      <span
                        className="board-webzine__image board-webzine__image--empty"
                        aria-hidden="true"
                      />
                    ))}
                  <span className="board-webzine__body">
                    {post.is_pinned && <span className="board-webzine__badge">공지</span>}
                    <span className="board-webzine__subject">
                      {post.is_secret && (
                        <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />
                      )}
                      {post.title}
                    </span>
                    {design.show_summary && post.summary && (
                      <span className="board-webzine__summary">{post.summary}</span>
                    )}
                    {!post.is_secret && (
                      <ListFieldValues
                        fields={post.list_fields}
                        className="board-webzine__fields"
                        itemClassName="board-webzine__field"
                      />
                    )}
                    {design.show_date && (
                      <time className="board-webzine__date" dateTime={date}>
                        {dotDate(date)}
                      </time>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      ) : board.board_type === 'CARD' ? (
        <ul className={`board-card board-card--cols-${design.columns} board-card${ratioClass}`}>
          {posts.map((post) => {
            const date = postDate(post.published_at)
            return (
              <li className="board-card__item" key={post.id}>
                <a className="board-card__link" href={hrefFor({ id: post.id })}>
                  {design.show_image && post.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                    <img className="board-card__image" src={post.thumbnail} alt="" loading="lazy" />
                  )}
                  <span className="board-card__body">
                    {post.is_pinned && <span className="board-card__badge">공지</span>}
                    <span className="board-card__subject">
                      {post.is_secret && (
                        <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />
                      )}
                      {post.title}
                    </span>
                    {design.show_summary && post.summary && (
                      <span className="board-card__summary">{post.summary}</span>
                    )}
                    {post.card_fields?.map((field) => (
                      <span className="board-card__field" key={field.key}>
                        {field.label}:{' '}
                        {field.field_type === 'IMAGE' ? '사진' : fieldValueText(field)}
                      </span>
                    ))}
                    {design.show_date && (
                      <time className="board-card__date" dateTime={date}>
                        {dotDate(date)}
                      </time>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="board-faq">
          {posts.map((post, index) => (
            <details
              className="board-faq__item"
              key={post.id}
              name={design.faq_single_open ? `faq-${board.slug}` : undefined}
              open={design.faq_first_open && index === 0}
            >
              <summary className="board-faq__question">
                <span className="board-faq__heading">
                  {post.is_secret && (
                    <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />
                  )}
                  {post.title}
                  {!post.is_secret && (
                    <ListFieldValues
                      fields={post.list_fields}
                      className="board-faq__fields"
                      itemClassName="board-faq__field"
                    />
                  )}
                </span>
              </summary>
              {post.is_secret ? (
                <p className="board-faq__answer">{SECRET_TEXT}</p>
              ) : (
                <BoardBody blocks={post.body ?? []} className="board-faq__answer" />
              )}
            </details>
          ))}
        </div>
      )}
    </BoardListShell>
  )
}
