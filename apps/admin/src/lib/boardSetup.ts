import type { Board, BoardOperation, BoardPermissions, BoardStatus } from '@cms/types'
import type { BoardInput } from '@/hooks/useBoards'

/** 게시판 설정 한 번에 저장 (T-228) — 네 구역의 고치는 값 */
export type SetupSection = 'basic' | 'permissions' | 'operation' | 'connection'

export interface SetupDraft {
  basic: {
    name: string
    description: string
    seo_title: string
    seo_description: string
    seo_index: boolean
    /** 콘텐츠형 게시판 (CM-01, T-249) */
    is_content: boolean
  }
  permissions: BoardPermissions
  operation: BoardOperation
  connection: { slug: string; status: BoardStatus; menu_parent: string }
}

// 저장하지 않은 게시판의 신고 기준은 5 (T-175) — 값이 없어도 바뀐 것으로 보지 않게 채운다
const DEFAULT_REPORT_HIDE_COUNT = 5

export const SETUP_SECTIONS: SetupSection[] = ['basic', 'permissions', 'operation', 'connection']

export function toSetupDraft(board: Board): SetupDraft {
  return {
    basic: {
      name: board.name,
      description: board.description,
      seo_title: board.seo_title,
      seo_description: board.seo_description,
      seo_index: board.seo_index,
      is_content: board.is_content ?? false,
    },
    permissions: { ...board.permissions },
    operation: {
      ...board.operation,
      report_hide_count: board.operation.report_hide_count ?? DEFAULT_REPORT_HIDE_COUNT,
    },
    connection: {
      slug: board.slug,
      status: board.status,
      menu_parent: board.menu_parent ?? '',
    },
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** 저장한 값과 다른 구역 */
export function changedSections(draft: SetupDraft, saved: SetupDraft): SetupSection[] {
  return SETUP_SECTIONS.filter((section) => !same(draft[section], saved[section]))
}

/** 바뀐 구역의 값만 모아 PATCH 한 번으로 — 서버가 한 트랜잭션에서 저장한다 */
export function setupPayload(draft: SetupDraft, saved: SetupDraft, isSystem: boolean): BoardInput {
  const changed = changedSections(draft, saved)
  const payload: BoardInput = {}
  if (changed.includes('basic')) {
    const { name, description, seo_title, seo_description, seo_index, is_content } = draft.basic
    Object.assign(payload, {
      name: name.trim(),
      description: description.trim(),
      is_content,
      // 기본 게시판은 화면이 템플릿 페이지라 검색 설정을 쓰지 않는다
      ...(isSystem
        ? {}
        : { seo_title: seo_title.trim(), seo_description: seo_description.trim(), seo_index }),
    })
  }
  if (changed.includes('permissions')) payload.permissions = draft.permissions
  if (changed.includes('operation')) payload.operation = draft.operation
  if (changed.includes('connection')) {
    const { slug, status, menu_parent } = draft.connection
    if (slug !== saved.connection.slug) payload.slug = slug
    if (status !== saved.connection.status) payload.status = status
    if (menu_parent !== saved.connection.menu_parent) payload.menu_parent = menu_parent
  }
  return payload
}

/** 서버 오류의 칸 → 구역 (그 구역으로 옮겨 보여 준다) */
export function sectionOfField(field: string | undefined): SetupSection | null {
  if (!field) return null
  const head = field.split('.')[0]
  if (
    ['name', 'description', 'seo_title', 'seo_description', 'seo_index', 'is_content'].includes(
      head
    )
  )
    return 'basic'
  if (head === 'permissions') return 'permissions'
  if (head === 'operation') return 'operation'
  if (['slug', 'status', 'menu_parent'].includes(head)) return 'connection'
  return null
}

/** 저장하면 홈페이지에서 달라지는 것 (QA 2.2-3) — 저장 막대 위에 한 줄씩 */
export function setupImpacts(
  draft: SetupDraft,
  saved: SetupDraft,
  { faqStructured }: { faqStructured: boolean }
): string[] {
  const impacts: string[] = []
  const deactivated = saved.connection.status === 'ACTIVE' && draft.connection.status !== 'ACTIVE'
  if (deactivated) {
    impacts.push('게시판을 끄면 홈페이지 메뉴 · 사이트맵에서 빠지고 글이 보이지 않습니다.')
  }
  const memberOnly = saved.permissions.read !== 'MEMBER' && draft.permissions.read === 'MEMBER'
  const noIndex = saved.basic.seo_index && !draft.basic.seo_index
  if (!deactivated && (memberOnly || noIndex)) {
    impacts.push(
      memberOnly
        ? '회원만 읽게 하면 검색엔진 사이트맵에서 빠집니다.'
        : '검색 노출을 끄면 검색엔진 사이트맵에서 빠집니다.'
    )
  }
  if (faqStructured && (deactivated || memberOnly)) {
    impacts.push('AEO 설정의 FAQ 구조화 데이터에서도 빠집니다.')
  }
  if (draft.connection.slug !== saved.connection.slug) {
    impacts.push('주소를 바꾸면 예전 주소로 들어온 방문자는 게시판을 찾지 못합니다.')
  }
  return impacts
}
