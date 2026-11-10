import type { Board } from '@cms/types'
import type { SettingUpdate } from '@/hooks/useSection'
import { strSetting } from './utils'

// 메인 화면 최신 글의 게시판 · 개수 (T-185) — 백엔드 app/services/board_latest.py 와 같은 범위
export const LATEST_BOARD_KEY = 'latest_board'
export const POST_COUNT_KEY = 'post_count'
export const LATEST_KEYS = [LATEST_BOARD_KEY, POST_COUNT_KEY]
export const COUNTS = [3, 4, 5, 6, 7, 8]

export interface LatestValue {
  board: string
  count: string
}

export const latestSettings = ({ board, count }: LatestValue): SettingUpdate[] => [
  strSetting(LATEST_BOARD_KEY, board),
  strSetting(POST_COUNT_KEY, count),
]

/** 메인에 보여 줄 수 있는 게시판 — 새 게시판 · 공지, 회원만 읽기는 제외 (방문자에게 제목이 보이면 안 된다) */
export const pickableBoard = (board: Board): boolean =>
  board.deleted_at === null &&
  (board.system_key === null || board.system_key === 'notice') &&
  board.permissions.read !== 'MEMBER'
