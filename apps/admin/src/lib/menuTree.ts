import type { MenuBoardOption, MenuNode, MenuPageOption } from '@cms/types'

/** 메뉴 관리 트리 (T-223, 사이트 관리 기획서 SM-02) — 화면에서 고치는 순수 함수들 */

export const MENU_LABEL_MAX = 20

export interface FlatNode {
  node: MenuNode
  depth: number
  parentId: string | null
  index: number
  siblings: number
}

/** 화면에 그릴 순서대로 펼친다 */
export function flatten(nodes: MenuNode[], depth = 1, parentId: string | null = null): FlatNode[] {
  return nodes.flatMap((node, index) => [
    { node, depth, parentId, index, siblings: nodes.length },
    ...flatten(node.children, depth + 1, node.id),
  ])
}

export function findNode(nodes: MenuNode[], id: string): MenuNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** 이 메뉴부터 맨 아래까지 몇 단계인지 (자기 포함) */
export const height = (node: MenuNode): number => 1 + Math.max(0, ...node.children.map(height))

export const depthOf = (nodes: MenuNode[], id: string): number =>
  flatten(nodes).find((f) => f.node.id === id)?.depth ?? 0

/** 자기 자신과 하위 메뉴 id — 상위 메뉴로 고를 수 없다 (순환 금지) */
export const subtreeIds = (node: MenuNode): string[] => [
  node.id,
  ...node.children.flatMap(subtreeIds),
]

export function updateNode(nodes: MenuNode[], id: string, change: Partial<MenuNode>): MenuNode[] {
  return nodes.map((node) =>
    node.id === id
      ? { ...node, ...change }
      : { ...node, children: updateNode(node.children, id, change) }
  )
}

/** 빼낸 메뉴와 나머지 트리 */
export function detach(nodes: MenuNode[], id: string): [MenuNode | null, MenuNode[]] {
  let taken: MenuNode | null = null
  const walk = (list: MenuNode[]): MenuNode[] =>
    list.flatMap((node) => {
      if (node.id === id) {
        taken = node
        return []
      }
      return [{ ...node, children: walk(node.children) }]
    })
  const rest = walk(nodes)
  return [taken, rest]
}

/** parentId 아래(null 이면 맨 위) 끝에 넣는다 */
export function appendTo(nodes: MenuNode[], parentId: string | null, node: MenuNode): MenuNode[] {
  if (parentId === null) return [...nodes, node]
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, node] }
      : { ...n, children: appendTo(n.children, parentId, node) }
  )
}

/** 같은 단계 안에서 한 칸 위 · 아래로 */
export function moveWithin(nodes: MenuNode[], id: string, delta: -1 | 1): MenuNode[] {
  const index = nodes.findIndex((n) => n.id === id)
  if (index >= 0) {
    const to = index + delta
    if (to < 0 || to >= nodes.length) return nodes
    const next = [...nodes]
    const [node] = next.splice(index, 1)
    next.splice(to, 0, node)
    return next
  }
  return nodes.map((n) => ({ ...n, children: moveWithin(n.children, id, delta) }))
}

/** 상위 메뉴 바꾸기 — 순환 · 단계 초과면 그대로 */
export function reparent(
  nodes: MenuNode[],
  id: string,
  parentId: string | null,
  maxDepth: number
): MenuNode[] {
  const node = findNode(nodes, id)
  if (!node || parentId === id) return nodes
  if (parentId && subtreeIds(node).includes(parentId)) return nodes
  const parentDepth = parentId ? depthOf(nodes, parentId) : 0
  if (parentDepth + height(node) > maxDepth) return nodes
  const [taken, rest] = detach(nodes, id)
  return taken ? appendTo(rest, parentId, taken) : nodes
}

/** 상위 메뉴로 고를 수 있는 메뉴 — 자기 · 하위 메뉴, 넣으면 단계를 넘는 메뉴는 뺀다 */
export function parentChoices(nodes: MenuNode[], id: string, maxDepth: number): FlatNode[] {
  const node = findNode(nodes, id)
  if (!node) return []
  const blocked = new Set(subtreeIds(node))
  return flatten(nodes).filter((f) => !blocked.has(f.node.id) && f.depth + height(node) <= maxDepth)
}

/** 메뉴 지우기 — keepChildren 이면 하위 메뉴를 그 자리(한 단계 위)로 올린다 */
export function removeNode(nodes: MenuNode[], id: string, keepChildren: boolean): MenuNode[] {
  return nodes.flatMap((node) => {
    if (node.id === id) return keepChildren ? node.children : []
    return [{ ...node, children: removeNode(node.children, id, keepChildren) }]
  })
}

let counter = 0
export const newNodeId = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`

/** 연결 대상 경고 — 홈페이지 메뉴에서 빠지는 까닭 */
export function nodeWarning(
  node: MenuNode,
  pages: MenuPageOption[],
  boards: MenuBoardOption[]
): string | null {
  if (node.type === 'page') {
    if (!node.target) return '연결할 페이지를 골라 주세요.'
    return pages.some((p) => p.key === node.target)
      ? null
      : '연결한 페이지가 지금 템플릿에 없어요 — 홈페이지 메뉴에서 빠져요.'
  }
  if (node.type === 'board') {
    const board = boards.find((b) => b.id === node.target)
    if (!node.target) return '연결할 게시판을 골라 주세요.'
    if (!board) return '연결한 게시판이 지워졌어요 — 홈페이지 메뉴에서 빠져요.'
    if (!board.active) return '사용 안 함인 게시판이에요 — 홈페이지 메뉴에서 빠져요.'
    return null
  }
  if (node.type === 'url') {
    return node.target && /^https?:\/\/\S+$/.test(node.target)
      ? null
      : '주소는 http:// 또는 https:// 로 시작해야 해요.'
  }
  return node.children.length === 0 ? '하위 메뉴가 없는 묶음은 홈페이지에 보이지 않아요.' : null
}

/** 저장 전에 막을 오류 (서버도 같은 규칙) */
export function treeError(nodes: MenuNode[]): string | null {
  for (const { node } of flatten(nodes)) {
    const label = node.label.trim()
    if (!label) return '이름이 비어 있는 메뉴가 있어요.'
    if (label.length > MENU_LABEL_MAX)
      return `'${label}' 메뉴 이름은 ${MENU_LABEL_MAX}자 이하로 입력해 주세요.`
    if (node.type !== 'group' && !node.target) return `'${label}' 메뉴의 연결 대상을 골라 주세요.`
    if (node.type === 'url' && !/^https?:\/\/\S+$/.test(node.target ?? ''))
      return `'${label}' 메뉴의 주소는 http:// 또는 https:// 로 시작해야 해요.`
  }
  return null
}

/** 상단 메뉴 후보 key (페이지 key · 섹션 id · board:{id}) 의 메뉴 */
const matches = (node: MenuNode, key: string) =>
  key.startsWith('board:')
    ? node.type === 'board' && node.target === key.slice(6)
    : node.type === 'page' && node.target === key

/**
 * 게시판 화면의 '상단 메뉴에 표시' (T-223) — 트리 어디에 있든 그 메뉴를 보이기 · 숨기기.
 * 트리에 없는데 켜면 맨 위 끝에 더한다.
 */
export function setVisibleByKey(
  nodes: MenuNode[],
  key: string,
  visible: boolean,
  label: string
): MenuNode[] {
  let found = false
  const walk = (list: MenuNode[]): MenuNode[] =>
    list.map((node) => {
      const hit = matches(node, key)
      if (hit) found = true
      return { ...node, visible: hit ? visible : node.visible, children: walk(node.children) }
    })
  const next = walk(nodes)
  if (found || !visible) return next
  const board = key.startsWith('board:')
  return [
    ...next,
    {
      id: newNodeId(),
      label: label.slice(0, MENU_LABEL_MAX),
      type: board ? 'board' : 'page',
      target: board ? key.slice(6) : key,
      new_window: false,
      visible: true,
      children: [],
    },
  ]
}
