import type { ReactNode } from 'react'
import type { PublicBoard, PublicPost } from '@cms/types'
import {
  type BoardPage,
  EDIT_PAGE,
  SECRET_TEXT,
  WRITE_PAGE,
  boardDesign,
  canMemberWrite,
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
  const { posts, total, page: current, totalPages, keyword, category } = list
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

  if (board.board_type === 'LIST') {
    return (
      <NoticeListView
        title={board.name}
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
        }))}
        total={total}
        page={current}
        totalPages={totalPages}
        keyword={keyword}
        hrefFor={listHref}
        searchTarget={listSearch}
        canWrite
        showDate={design.show_date}
        tabs={tabs}
        memberWriteHref={memberWriteHref}
      />
    )
  }

  return (
    <BoardListShell
      title={board.name}
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
                    {post.is_secret && <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />}
                    {post.title}
                  </span>
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
                      {post.is_secret && <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />}
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
                {post.is_secret && <i className="ri-lock-line board-secret" aria-label="비밀글" role="img" />}
                {post.title}
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
