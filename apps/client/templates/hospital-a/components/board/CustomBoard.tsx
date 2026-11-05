import type { PublicBoard } from '@cms/types'
import { loadBoardPage } from '@/lib/boardRoute'
import { fetchPublicPost, postDate } from '@/lib/publicPosts'
import { BoardBody } from './BoardBody'
import { BoardEmpty, BoardListShell } from './BoardListShell'
import type { SearchTarget } from './BoardToolbar'
import { dotDate } from './format'
import { NoticeDetailView, NoticeListView } from './NoticeBoard'

interface CustomBoardProps {
  board: PublicBoard
  tenantSlug: string
  detailId?: string
  q?: string
  page: number
  hrefFor: (extra?: { id?: string; q?: string; p?: number }) => string
  searchTarget: SearchTarget
}

const EMPTY_TEXT = '등록된 글이 없습니다.'

/** 고객이 추가한 게시판 — 유형별 목록 + 공통 상세 (게시판 모듈 기획서 5.3 · 7장, T-140-B) */
export async function CustomBoard({ board, tenantSlug, detailId, q, page, hrefFor, searchTarget }: CustomBoardProps) {
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
        prevHref={post.prev_id ? hrefFor({ id: post.prev_id }) : null}
        nextHref={post.next_id ? hrefFor({ id: post.next_id }) : null}
        listHref={hrefFor()}
      />
    )
  }

  const { posts, total, page: current, totalPages, keyword } = await loadBoardPage(tenantSlug, board, { page, q })
  const searchLabel = `${board.name} 검색`

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
        hrefFor={hrefFor}
        searchTarget={searchTarget}
        canWrite
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
      hrefFor={hrefFor}
      searchTarget={searchTarget}
      searchLabel={searchLabel}
    >
      {posts.length === 0 ? (
        <BoardEmpty keyword={keyword} emptyText={EMPTY_TEXT} />
      ) : board.board_type === 'GALLERY' ? (
        <ul className="board-gallery">
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
                  <time className="board-gallery__date" dateTime={date}>
                    {dotDate(date)}
                  </time>
                </a>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="board-faq">
          {posts.map((post) => (
            <details className="board-faq__item" key={post.id}>
              <summary className="board-faq__question">{post.title}</summary>
              <BoardBody blocks={post.body ?? []} className="board-faq__answer" />
            </details>
          ))}
        </div>
      )}
    </BoardListShell>
  )
}
