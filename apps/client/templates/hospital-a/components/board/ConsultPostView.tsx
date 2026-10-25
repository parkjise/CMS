import type { BoardPost } from '@/lib/publicBoard'
import { RichLine } from '../sub/RichText'
import { BoardViewNav } from './BoardViewNav'
import { dotDate, toParagraphs } from './format'

interface Props {
  post: BoardPost
  brandName: string
  prevHref: string | null
  nextHref: string | null
  listHref: string
}

/** 상담 상세 — 목업 sub/consult-view.html (내용 + 답변 박스, 답변 전이면 같은 박스에 대기 안내) */
export function ConsultPostView({ post, brandName, prevHref, nextHref, listHref }: Props) {
  return (
    <section className="board-view" aria-labelledby="board-view-title">
      <div className="page-container">
        <article className="board-view__article">
          <header className="board-view__head">
            <h2 className="board-view__title" id="board-view-title">
              <span className="board-view__badge">{post.answered ? '답변완료' : '답변대기'}</span>
              {post.subject}
            </h2>
            <dl className="board-view__meta">
              <div className="board-view__meta-item">
                <dt>작성자</dt>
                <dd>{post.author}</dd>
              </div>
              <div className="board-view__meta-item">
                <dt>등록일</dt>
                <dd>
                  <time dateTime={post.created_at}>{dotDate(post.created_at)}</time>
                </dd>
              </div>
            </dl>
          </header>
          <div className="board-view__content">
            {toParagraphs(post.message).map((p, i) => (
              <p key={i}>
                <RichLine text={p} />
              </p>
            ))}
          </div>
          {post.answer ? (
            <section className="board-view__answer" aria-labelledby="board-view-answer-title">
              <header className="board-view__answer-head">
                <h3 className="board-view__answer-title" id="board-view-answer-title">
                  <span className="board-view__answer-mark" aria-hidden="true">
                    A
                  </span>
                  {brandName} 답변
                </h3>
                {post.answered_at && (
                  <time className="board-view__answer-date" dateTime={post.answered_at}>
                    {dotDate(post.answered_at)}
                  </time>
                )}
              </header>
              <div className="board-view__content board-view__content--answer">
                {toParagraphs(post.answer).map((p, i) => (
                  <p key={i}>
                    <RichLine text={p} />
                  </p>
                ))}
              </div>
            </section>
          ) : (
            // 답변 전: 같은 답변 박스에 대기 안내 (목업에 별도 스타일 없음)
            <section className="board-view__answer" aria-labelledby="board-view-answer-title">
              <header className="board-view__answer-head">
                <h3 className="board-view__answer-title" id="board-view-answer-title">
                  <span className="board-view__answer-mark" aria-hidden="true">
                    A
                  </span>
                  {brandName} 답변
                </h3>
              </header>
              <div className="board-view__content board-view__content--answer">
                <p>아직 답변이 등록되지 않았습니다. 확인 후 빠르게 답변드리겠습니다.</p>
              </div>
            </section>
          )}
        </article>
        <BoardViewNav prevHref={prevHref} nextHref={nextHref} listHref={listHref} />
      </div>
    </section>
  )
}
