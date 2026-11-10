/** 게시판 관리 하위 메뉴가 여는 게시판별 화면 (T-187, UI/UX 시안 v3) */
export type BoardSection =
  | 'design'
  | 'fields'
  | 'categories'
  | 'permissions'
  | 'operation'
  | 'settings'

export const BOARD_SECTIONS: BoardSection[] = [
  'design',
  'fields',
  'categories',
  'permissions',
  'operation',
  'settings',
]

/** 기본 게시판(공지)에는 없는 화면 — 칸 · 카테고리 · 권한 · 운영 설정 */
export const CUSTOM_ONLY_SECTIONS: string[] = ['fields', 'categories', 'permissions', 'operation']

/** 마지막으로 작업한 게시판 — 탭을 닫으면 잊는다 */
export const BOARD_CONTEXT_KEY = 'cms-board-management-context'

export const BOARD_SECTION_TITLES: Record<string, string> = {
  posts: '게시글 관리',
  settings: '게시판 환경설정',
  fields: '필드 관리',
  categories: '카테고리 관리',
  design: '게시판 디자인',
  permissions: '권한 관리',
  operation: '운영 설정',
  connection: '홈페이지 연결',
}

export const BOARD_SECTION_HELP: Record<string, string> = {
  posts: '선택한 게시판의 글을 쓰고 고치며, 공개 상태와 공지 여부를 관리하세요.',
  settings: '게시판 이름, 설명과 검색 노출을 설정하세요.',
  fields: '기본 필드만으로도 쓸 수 있어요. 추가 정보가 필요할 때 사용자 정의 필드를 만드세요.',
  categories: '글을 나눌 카테고리를 추가하고 표시 여부와 순서를 관리하세요.',
  design: '글은 그대로 두고 보여 주는 방식을 바꾸세요. 오른쪽에서 저장 전 모습을 확인할 수 있어요.',
  permissions: '게시판을 읽고 쓸 수 있는 사람을 정하세요. 회원 기능과 업종 제한은 그대로 적용돼요.',
  operation: '비밀글, 새 글 알림, 비회원 글쓰기 같은 운영 방식을 정하세요.',
  connection: '게시판 주소와 사용 여부, 홈페이지 메뉴 표시를 설정하세요.',
}

export function readBoardContext(): string | null {
  try {
    return sessionStorage.getItem(BOARD_CONTEXT_KEY)
  } catch {
    return null
  }
}

export function saveBoardContext(boardId: string) {
  try {
    sessionStorage.setItem(BOARD_CONTEXT_KEY, boardId)
  } catch {
    // 저장소를 못 써도 화면은 그대로 동작한다
  }
}
