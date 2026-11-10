import type { AuditLogEntry, AuditLogKind } from '@cms/types'

/** 변경 기록 종류 필터 (T-186) */
export const AUDIT_KIND_LABELS: Record<AuditLogKind, string> = {
  board: '게시판',
  post: '글',
  setup: '칸 · 카테고리',
}

const ACTION_LABELS: Record<string, string> = {
  BOARD_CREATED: '게시판 추가',
  BOARD_UPDATED: '게시판 설정 변경',
  BOARD_DUPLICATED: '게시판 복제',
  BOARD_DELETED: '게시판 휴지통으로',
  BOARD_RESTORED: '게시판 복원',
  BOARD_FIELD_CREATED: '칸 추가',
  BOARD_FIELD_UPDATED: '칸 변경',
  BOARD_FIELD_DELETED: '칸 삭제',
  BOARD_FIELD_RESTORED: '칸 복원',
  BOARD_FIELD_TYPE_CONVERTED: '칸 형식 바꾸기',
  BOARD_FIELD_CHOICE_REMAPPED: '선택지 값 옮기기',
  BOARD_CATEGORY_CREATED: '카테고리 추가',
  BOARD_CATEGORY_UPDATED: '카테고리 변경',
  BOARD_CATEGORY_DELETED: '카테고리 삭제',
  BOARD_CATEGORIES_MERGED: '카테고리 합치기',
  POST_DELETED: '글 휴지통으로',
  POST_RESTORED: '글 복원',
  POST_MOVED: '다른 게시판으로 글 옮기기',
  POST_BULK_PUBLISH: '글 일괄 공개',
  POST_BULK_PRIVATE: '글 일괄 비공개',
  POST_BULK_TRASH: '글 일괄 휴지통으로',
  POST_BULK_RESTORE: '글 일괄 복원',
  POST_REPORTS_DISMISS: '신고 닫기',
  POST_REPORTS_PUBLISH: '신고 닫고 다시 공개',
  POST_REPORTS_HIDE: '신고 닫고 비공개로',
  POST_REPORTS_DELETE: '신고 닫고 휴지통으로',
}

/** 모르는 기록도 빈칸 대신 원래 이름으로 보여 준다 — 새 기록이 늘어도 화면이 깨지지 않게 */
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action

/** 대상 칸 — "게시판 이름 · 대상 이름 · N개" 중 있는 것만 */
export function auditTarget(entry: AuditLogEntry): string {
  const parts = [entry.board_name, entry.target_name].filter((part): part is string => !!part)
  if (entry.count !== null) parts.push(`${entry.count.toLocaleString()}개`)
  return parts.join(' · ') || '-'
}
