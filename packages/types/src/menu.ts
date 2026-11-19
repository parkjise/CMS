/** 메뉴 관리 트리 (T-223, 사이트 관리 기획서 SM-02) */

/** page: 템플릿 페이지(코드형) · 홈 섹션(테마형) / board: 게시판 / url: 외부 주소 / group: 하위 메뉴 묶음 */
export type MenuNodeType = 'page' | 'board' | 'url' | 'group'

/** 관리자가 고치고 저장하는 메뉴 한 칸 */
export interface MenuNode {
  id: string
  label: string
  type: MenuNodeType
  /** page: 페이지 key · 섹션 id / board: 게시판 id / url: http(s) 주소 / group: null */
  target: string | null
  new_window: boolean
  visible: boolean
  children: MenuNode[]
}

/** 연결할 수 있는 페이지 — 코드형은 템플릿 페이지(하위 포함), 테마형은 홈 섹션 */
export interface MenuPageOption {
  key: string
  label: string
  parent: string | null
}

export interface MenuBoardOption {
  id: string
  name: string
  slug: string
  /** 홈페이지에 나가는지 — 사용 안 함이면 메뉴에 있어도 빠진다 */
  active: boolean
  member_only: boolean
  menu_parent: string | null
}

/** 상단 메뉴 후보가 트리 어디에 있든 — 게시판 화면의 '상단 메뉴에 표시' 등 */
export interface MenuFlatItem {
  key: string
  default_label: string
  label: string | null
  visible: boolean
}

export interface SiteMenu {
  mode: 'theme' | 'code'
  reorderable: boolean
  /** 트리를 저장했는지 — 아니면 지금 홈페이지 메뉴를 트리로 바꿔 보여 준다 */
  saved: boolean
  max_depth: number
  nodes: MenuNode[]
  pages: MenuPageOption[]
  boards: MenuBoardOption[]
  items: MenuFlatItem[]
}

/** 홈페이지에 그릴 메뉴 — 숨긴 메뉴 · 갈 곳 없는 메뉴 · 빈 묶음은 서버가 이미 뺐다 */
export interface PublicMenuNode {
  label: string
  type: MenuNodeType
  target: string | null
  /** 게시판 주소 (board 만) */
  slug: string | null
  new_window: boolean
  children: PublicMenuNode[]
}
