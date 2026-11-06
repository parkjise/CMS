import type { PublicBoard } from '@cms/types'
import { boardDesign, loadBoardPage } from '@/lib/boardRoute'
import { fetchPublicPost, fieldValueText, postDate } from '@/lib/publicPosts'
import { BoardBody } from './BoardBody'
import { BoardCategoryTabs } from './BoardCategoryTabs'
import { BoardEmpty, BoardListShell } from './BoardListShell'
import type { SearchTarget } from './BoardToolbar'
import { dotDate } from './format'
import { NoticeDetailView, NoticeListView } from './NoticeBoard'

interface CustomBoardProps {
  board: PublicBoard
  tenantSlug: string
  detailId?: string
  q?: string
  /** 주소의 카테고리 id (T-149) */
  c?: string
  page: number
  hrefFor: (extra?: { id?: string; q?: string; p?: number; c?: string }) => string
  searchTarget: SearchTarget
}

const EMPTY_TEXT = '등록된 글이 없습니다.'

/** 고객이 추가한 게시판 — 유형별 목록 + 공통 상세 (게시판 모듈 기획서 5.3 · 7장, T-140-B) */
export async function CustomBoard({
  board,
  tenantSlug,
  detailId,
  q,
  c,
  page,
  hrefFor,
  searchTarget,
}: CustomBoardProps) {
  if (detailId) {
    const post = await fetchPublicPost(tenantSlug, board.slug, detailId)
    if (!post) {
      return (
        <section className="board-list" aria-label={board.name}>
          <div className="page-container">
            <p className="board-list__empty">게시글을 찾을 수 없습니다.</p>
          </div>
        </section>
      )
    }
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
      />
    )
  }

  const { posts, total, page: current, totalPages, keyword, category } = await loadBoardPage(tenantSlug, board, {
    page,
    q,
    c,
  })
  // 검색 · 페이지 이동은 고른 카테고리 안에서 (T-149)
  const listHref: CustomBoardProps['hrefFor'] = (extra) => hrefFor(extra?.id ? extra : { ...extra, c: category })
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
    >
      {posts.length === 0 ? (
        <BoardEmpty keyword={keyword} emptyText={EMPTY_TEXT} />
      ) : board.board_type === 'GALLERY' ? (
        <ul className={`board-gallery board-gallery--cols-${design.columns} board-gallery${ratioClass}`}>
          {posts.map((post) => {
            const date = postDate(post.published_at)
            return (
              <li className="board-gallery__item" key={post.id}>
                <a className="board-gallery__link" href={hrefFor({ id: post.id })}>
                  {post.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                    <img className="board-gallery__image" src={post.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="board-gallery__image board-gallery__image--empty" aria-hidden="true" />
                  )}
                  {post.is_pinned && <span className="board-gallery__badge">공지</span>}
                  <span className="board-gallery__subject">{post.title}</span>
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
                    <span className="board-card__subject">{post.title}</span>
                    {design.show_summary && post.summary && <span className="board-card__summary">{post.summary}</span>}
                    {post.card_fields?.map((field) => (
                      <span className="board-card__field" key={field.key}>
                        {field.label}: {field.field_type === 'IMAGE' ? '사진' : fieldValueText(field)}
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
              <summary className="board-faq__question">{post.title}</summary>
              <BoardBody blocks={post.body ?? []} className="board-faq__answer" />
            </details>
          ))}
        </div>
      )}
    </BoardListShell>
  )
}
