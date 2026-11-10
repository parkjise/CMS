import type { PublicCategory } from '@cms/types'
import { type CategoryTab, categoryTabRows } from '@/lib/categoryTabs'

interface BoardCategoryTabsProps {
  categories: PublicCategory[]
  /** 지금 고른 카테고리 id — 없으면 '전체' */
  current?: string
  /** 카테고리 목록 주소 — 검색어 · 페이지는 버린다 */
  hrefFor: (c?: string) => string
}

interface TabRowProps {
  label: string
  tabs: CategoryTab[]
  current?: string
  hrefFor: (c?: string) => string
  sub?: boolean
}

function TabRow({ label, tabs, current, hrefFor, sub }: TabRowProps) {
  return (
    <ul className={`board-tabs__list${sub ? ' board-tabs__list--sub' : ''}`} aria-label={label}>
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
  )
}

/** 게시판 카테고리 탭 (T-149) — 분류가 없으면 그리지 않는다. 고른 상위에 하위가 있으면 둘째 줄 (T-179) */
export function BoardCategoryTabs({ categories, current, hrefFor }: BoardCategoryTabsProps) {
  if (categories.length === 0) return null
  const { top, topCurrent, sub } = categoryTabRows(categories, current)
  return (
    <nav className="board-tabs" aria-label="카테고리">
      <TabRow label="상위 카테고리" tabs={top} current={topCurrent} hrefFor={hrefFor} />
      {sub.length > 0 && (
        <TabRow label="하위 카테고리" tabs={sub} current={current} hrefFor={hrefFor} sub />
      )}
    </nav>
  )
}
