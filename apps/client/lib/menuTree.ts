import type { PublicMenuNode } from '@cms/types'

/** 홈페이지 메뉴 트리 (T-223) — 서버가 정리한 트리를 템플릿마다 주소로 바꾼다 */

export interface MenuLink {
  /** React key — 트리 안 위치 */
  key: string
  label: string
  /** 없으면 같은 화면 섹션으로 내려가기(sectionId) 또는 묶음 제목 */
  href?: string
  /** 테마형 홈 섹션 — 메인 화면에서는 주소 대신 그 섹션으로 내려간다 */
  sectionId?: string
  /** 새 창 — rel="noopener noreferrer" 를 함께 붙인다 */
  newWindow: boolean
  /** 휴대폰에서 숨긴 섹션 (T-037-D) */
  mobileHidden?: boolean
  children: MenuLink[]
}

export interface PageTarget {
  href?: string
  sectionId?: string
  mobileHidden?: boolean
}

interface Resolve {
  /** 페이지 key · 섹션 id → 주소. null 이면 그 메뉴는 그리지 않는다 */
  page: (target: string) => PageTarget | null
  board: (slug: string) => string
}

export function menuLinks(nodes: PublicMenuNode[], resolve: Resolve, prefix = 'm'): MenuLink[] {
  return nodes.flatMap((node, index) => {
    const key = `${prefix}-${index}`
    const children = menuLinks(node.children ?? [], resolve, key)
    const base = { key, label: node.label, newWindow: Boolean(node.new_window), children }
    if (node.type === 'group') return children.length > 0 ? [base] : []
    if (node.type === 'url') return node.target ? [{ ...base, href: node.target }] : []
    if (node.type === 'board') return node.slug ? [{ ...base, href: resolve.board(node.slug) }] : []
    const page = node.target ? resolve.page(node.target) : null
    return page ? [{ ...base, ...page }] : []
  })
}

/** 새 창 링크 속성 — 연 페이지가 이 창을 조작하지 못하게 */
export const linkTarget = (link: Pick<MenuLink, 'newWindow'>) =>
  link.newWindow ? ({ target: '_blank', rel: 'noopener noreferrer' } as const) : {}

/** 휴대폰 메뉴 — 휴대폰에서 숨긴 섹션은 빼고, 비게 된 묶음도 뺀다 */
export function mobileLinks(links: MenuLink[]): MenuLink[] {
  return links.flatMap((link) => {
    if (link.mobileHidden) return []
    const children = mobileLinks(link.children)
    if (!link.href && !link.sectionId && children.length === 0) return []
    return [{ ...link, children }]
  })
}
