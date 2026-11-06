import type { PublicCategory } from '@cms/types'

interface BoardCategoryTabsProps {
  categories: PublicCategory[]
  /** 지금 고른 카테고리 id — 없으면 '전체' */
  current?: string
  /** 카테고리 목록 주소 — 검색어 · 페이지는 버린다 */
  hrefFor: (c?: string) => string
}

/** 게시판 카테고리 탭 (T-149) — 분류가 없으면 그리지 않는다 */
export function BoardCategoryTabs({ categories, current, hrefFor }: BoardCategoryTabsProps) {
  if (categories.length === 0) return null
  const tabs = [{ id: undefined, name: '전체' }, ...categories]
  return (
    <nav className="board-tabs" aria-label="카테고리">
      <ul className="board-tabs__list">
        {tabs.map((tab) => (
          <li className="board-tabs__item" key={tab.id ?? 'all'}>
            <a
              className="board-tabs__link"
              href={hrefFor(tab.id)}
              aria-current={tab.id === current ? 'page' : undefined}
            >
              {tab.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
