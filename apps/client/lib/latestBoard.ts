/**
 * 메인 화면 최신 글 · 게시판 연결 섹션의 칸 (T-185, T-243).
 * 섹션에는 게시판 id 를 저장한다 — 주소를 바꿔도 연결이 끊기지 않게.
 * 사이트 응답의 게시판(운영 중인 것만)에서 id 로 찾아 주소를 얻는다.
 * 저장 값 검사는 백엔드 app/services/board_latest.py.
 */
import type { PublicBoard } from '@cms/types'
import type { SectionSort } from './publicPosts'
import { getString } from './sectionSettings'
import type { PublicSection } from './publicSite.types'

export const LATEST_BOARD_KEY = 'latest_board'
export const POST_COUNT_KEY = 'post_count'
const MIN_COUNT = 3
const MAX_COUNT = 8
/** 게시판 연결(테마형)은 카드 · FAQ · 연혁으로 더 많이 보여 준다 */
export const CONNECT_MAX_COUNT = 12

export type DisplayMode = 'LIST' | 'CARD' | 'FAQ' | 'TIMELINE'
const DISPLAY_MODES: readonly DisplayMode[] = ['LIST', 'CARD', 'FAQ', 'TIMELINE']
const SORTS: readonly SectionSort[] = ['latest', 'oldest', 'board']

/** 고른 게시판 — 없거나 · 운영 중이 아니거나 · 회원만 읽기면 null */
export function latestBoard(
  section: PublicSection,
  boards: PublicBoard[] | null | undefined,
): PublicBoard | null {
  const id = getString(section.settings, LATEST_BOARD_KEY).trim()
  if (!id) return null
  const board = (boards ?? []).find((b) => b.id === id)
  // 회원 전용 글 제목이 방문자에게 보이면 안 된다 — 저장 때도 막지만 나중에 바뀐 경우
  return board && board.read_access !== 'MEMBER' ? board : null
}

/** 보여 줄 글 수 — 비었거나 범위를 벗어나면 기본값 */
export function latestCount(section: PublicSection, fallback: number, max = MAX_COUNT): number {
  const count = Number(getString(section.settings, POST_COUNT_KEY))
  return Number.isInteger(count) && count >= MIN_COUNT && count <= max ? count : fallback
}

/** 게시판 연결의 보여 주는 방식 · 정렬 · 분류 · 빈 결과 문구 (T-243) — 모르는 값은 기본값 */
export function connectOptions(section: PublicSection) {
  const mode = getString(section.settings, 'display_mode') as DisplayMode
  const sort = getString(section.settings, 'sort') as SectionSort
  return {
    mode: DISPLAY_MODES.includes(mode) ? mode : 'LIST',
    sort: SORTS.includes(sort) ? sort : 'latest',
    category: getString(section.settings, 'category_id').trim() || undefined,
    emptyText: getString(section.settings, 'empty_text').trim(),
  } as const
}
