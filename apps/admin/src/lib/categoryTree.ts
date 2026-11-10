import type { BoardCategory } from '@cms/types'

/** 카테고리 2단계 (T-179) — 상위 바로 뒤에 그 하위가 오도록 정렬한다 */

/** 상위가 목록에 없으면(지워졌거나 다른 게시판) 1단계로 본다 */
const parentOf = (category: BoardCategory, ids: Set<string>) =>
  category.parent_id && ids.has(category.parent_id) ? category.parent_id : null

/** 서버 순서(display_order)를 지키며 상위 → 그 하위 순으로 펼친다 */
export function orderTree(categories: BoardCategory[]): BoardCategory[] {
  const ids = new Set(categories.map((c) => c.id))
  const tops = categories.filter((c) => parentOf(c, ids) === null)
  return tops.flatMap((top) => [top, ...categories.filter((c) => parentOf(c, ids) === top.id)])
}

export const isChild = (category: BoardCategory, categories: BoardCategory[]) =>
  parentOf(category, new Set(categories.map((c) => c.id))) !== null

export const childrenOf = (category: BoardCategory, categories: BoardCategory[]) =>
  categories.filter((c) => c.parent_id === category.id)

/** 화면 표시 이름 — 하위는 `상위 › 하위` */
export function categoryLabel(category: BoardCategory, categories: BoardCategory[]): string {
  const parent = categories.find((c) => c.id === category.parent_id)
  return parent ? `${parent.name} › ${category.name}` : category.name
}

/**
 * 형제끼리 자리를 바꾼다 — from · to 는 같은 상위를 가진 분류여야 한다.
 * 바꾼 뒤의 전체 순서(상위 → 하위 펼침)를 돌려준다. 형제가 아니면 null.
 */
export function moveAmongSiblings(
  categories: BoardCategory[],
  fromId: string,
  toId: string
): BoardCategory[] | null {
  const ids = new Set(categories.map((c) => c.id))
  const from = categories.find((c) => c.id === fromId)
  const to = categories.find((c) => c.id === toId)
  if (!from || !to || parentOf(from, ids) !== parentOf(to, ids)) return null
  const tree = orderTree(categories)
  const parent = parentOf(from, ids)
  const siblings = tree.filter((c) => parentOf(c, ids) === parent)
  const fromIndex = siblings.indexOf(from)
  const toIndex = siblings.indexOf(to)
  const moved = [...siblings]
  moved.splice(toIndex, 0, ...moved.splice(fromIndex, 1))
  // 형제 자리에 새 순서대로 다시 채운다 — 다른 분류의 상대 순서는 그대로
  let next = 0
  return orderTree(tree.map((c) => (parentOf(c, ids) === parent ? moved[next++] : c)))
}
