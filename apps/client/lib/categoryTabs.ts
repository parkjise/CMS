import type { PublicCategory } from '@cms/types'

/** 카테고리 2단계 탭 (T-179) — 첫 줄은 상위, 고른 상위에 하위가 있으면 둘째 줄 */

export interface CategoryTab {
  /** 없으면 '전체' */
  id?: string
  name: string
}

export interface CategoryTabRows {
  top: CategoryTab[]
  /** 첫 줄에서 불이 들어올 탭 — 하위를 골랐으면 그 상위 */
  topCurrent?: string
  /** 고른 상위의 하위 탭 — 첫 칸은 상위 전체(상위 id) */
  sub: CategoryTab[]
}

/** 상위가 목록에 없으면(숨김 · 삭제) 1단계로 본다 — 서버는 숨긴 상위의 하위를 보내지 않는다 */
const parentOf = (category: PublicCategory, ids: Set<string>) =>
  category.parent_id && ids.has(category.parent_id) ? category.parent_id : undefined

export function categoryTabRows(categories: PublicCategory[], current?: string): CategoryTabRows {
  const ids = new Set(categories.map((c) => c.id))
  const selected = categories.find((c) => c.id === current)
  const topCurrent = selected ? (parentOf(selected, ids) ?? selected.id) : undefined
  const top = [
    { name: '전체' },
    ...categories.filter((c) => !parentOf(c, ids)).map(({ id, name }) => ({ id, name })),
  ]
  const children = topCurrent
    ? categories.filter((c) => parentOf(c, ids) === topCurrent).map(({ id, name }) => ({ id, name }))
    : []
  const sub = children.length > 0 ? [{ id: topCurrent, name: '전체' }, ...children] : []
  return { top, topCurrent, sub }
}

/** 글쓰기 고르기 — 상위 뒤에 그 하위, 하위는 `상위 › 하위` */
export function categoryOptions(categories: PublicCategory[]): CategoryTab[] {
  const ids = new Set(categories.map((c) => c.id))
  const tops = categories.filter((c) => !parentOf(c, ids))
  return tops.flatMap((top) => [
    { id: top.id, name: top.name },
    ...categories
      .filter((c) => parentOf(c, ids) === top.id)
      .map((c) => ({ id: c.id, name: `${top.name} › ${c.name}` })),
  ])
}
