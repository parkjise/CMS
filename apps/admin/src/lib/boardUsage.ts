import type { BoardUsageSection } from '@cms/types'

/** 게시판 지우기 확인에 붙이는 사용 위치 안내 (T-243) — 연결된 섹션이 없으면 빈 글자 */
export const usageWarning = (usage: BoardUsageSection[] | undefined): string =>
  usage?.length
    ? ` 이 게시판을 보여 주는 섹션 ${usage.length}개(${[...new Set(usage.map((u) => u.page_title))].join(', ')})도 홈페이지에서 보이지 않게 됩니다.`
    : ''
