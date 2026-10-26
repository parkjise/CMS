interface Props {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
  className: string
}

const WINDOW = 5

/** 페이지 이동 — 목업 .pagination (처음 · 이전 · 번호 5개 · 다음 · 마지막) */
export function Pagination({ page, totalPages, hrefFor, className }: Props) {
  if (totalPages < 1) return null
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1))
  const pages = Array.from({ length: Math.min(WINDOW, totalPages) }, (_, i) => start + i)
  const arrow = (target: number, label: string, icon: string) => (
    <a className="pagination__page pagination__page--arrow" href={hrefFor(target)} aria-label={label}>
      <i className={icon} aria-hidden="true" />
    </a>
  )
  return (
    <nav className={`pagination ${className}`} aria-label="페이지 이동">
      {arrow(1, '첫 페이지', 'ri-arrow-left-double-line')}
      {arrow(Math.max(1, page - 1), '이전 페이지', 'ri-arrow-left-s-line')}
      <ol className="pagination__pages">
        {pages.map((p) => (
          <li key={p}>
            <a className="pagination__page" href={hrefFor(p)} aria-current={p === page ? 'page' : undefined}>
              {p}
            </a>
          </li>
        ))}
      </ol>
      {arrow(Math.min(totalPages, page + 1), '다음 페이지', 'ri-arrow-right-s-line')}
      {arrow(totalPages, '마지막 페이지', 'ri-arrow-right-double-line')}
    </nav>
  )
}
