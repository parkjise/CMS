export interface SearchTarget {
  action: string
  /** 미리보기 유지용 숨은 값 (tpl · content · page) */
  hidden: [string, string][]
}

interface Props {
  total: number
  q?: string
  label: string
  inputId: string
  target: SearchTarget
  className: string
  /** 게시판 디자인의 표시 옵션 (T-220) */
  showTotal?: boolean
  showSearch?: boolean
}

/** 총 건수 | 검색 — 목업 .board-toolbar (서버 검색: GET ?q=) */
export function BoardToolbar({
  total,
  q,
  label,
  inputId,
  target,
  className,
  showTotal = true,
  showSearch = true,
}: Props) {
  if (!showTotal && !showSearch) return null
  return (
    <div className={`board-toolbar ${className}`}>
      {showTotal && (
        <p className="board-toolbar__total">
          총 <strong className="board-toolbar__count">{total}</strong>건
        </p>
      )}
      {showSearch && (
        <form className="board-toolbar__search" role="search" action={target.action} method="get">
          {target.hidden.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
          <input
            className="board-toolbar__search-input"
            type="search"
            id={inputId}
            name="q"
            defaultValue={q}
            maxLength={60}
            placeholder="검색어를 입력해 주세요."
          />
          <button className="board-toolbar__search-button" type="submit" aria-label="검색">
            <i className="ri-search-line" aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  )
}
