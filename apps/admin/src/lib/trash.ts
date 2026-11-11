import dayjs from 'dayjs'

/** 휴지통 보관 기간 (T-196, 기획서 D-06) — 지나면 매일 04:30 영구 삭제 */
export const TRASH_RETENTION_DAYS = 30

interface TrashInfo {
  purge_at?: string | null
  deleted_by?: string | null
}

/** "12일 뒤 영구 삭제" — 오늘 · 지난 것은 "곧 영구 삭제" */
export const purgeLabel = ({ purge_at }: TrashInfo): string | null => {
  if (!purge_at) return null
  const days = Math.ceil(dayjs(purge_at).diff(dayjs(), 'hour') / 24)
  return days > 0 ? `${days}일 뒤 영구 삭제` : '곧 영구 삭제'
}

/** 휴지통 한 줄 안내 — 남은 기간 · 지운 사람 */
export const trashNote = (item: TrashInfo): string =>
  [purgeLabel(item), item.deleted_by ? `${item.deleted_by} 삭제` : null].filter(Boolean).join(' · ')
