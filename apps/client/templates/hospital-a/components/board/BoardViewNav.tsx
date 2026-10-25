interface Props {
  prevHref?: string | null
  nextHref?: string | null
  listHref: string
}

/** 이전 · 목록 · 다음 — 목업 .board-view__nav (없는 쪽은 자리만 유지) */
export function BoardViewNav({ prevHref, nextHref, listHref }: Props) {
  return (
    <nav className="board-view__nav" aria-label="게시글 이동">
      {prevHref ? (
        <a className="board-view__nav-item board-view__nav-item--prev" href={prevHref}>
          <i className="ri-arrow-left-line" aria-hidden="true" />
          이전 게시글
        </a>
      ) : (
        <span className="board-view__nav-item board-view__nav-item--prev board-view__nav-item--empty" />
      )}
      <a className="board-view__list-button" href={listHref}>
        목록보기
      </a>
      {nextHref ? (
        <a className="board-view__nav-item board-view__nav-item--next" href={nextHref}>
          다음 게시글
          <i className="ri-arrow-right-line" aria-hidden="true" />
        </a>
      ) : (
        <span className="board-view__nav-item board-view__nav-item--next board-view__nav-item--empty" />
      )}
    </nav>
  )
}
