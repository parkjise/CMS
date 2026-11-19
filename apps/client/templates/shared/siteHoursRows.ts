import { hoursRows, type HoursRow } from '@/lib/siteHours'
import type { PublicFieldGroup } from '@cms/types'

/**
 * 코드형 템플릿의 사이트 공통 정보(resolveSiteInfo)에서 운영시간 줄을 읽는다 (T-222).
 * 실제 사이트는 hours_rows(요일별 표 또는 예전 글자), 샘플 미리보기는 샘플의 평일 · 토요일 글자.
 */
export function siteHoursRows(info: Record<string, string>): HoursRow[] {
  if (info.hours_rows) {
    try {
      const rows = JSON.parse(info.hours_rows) as HoursRow[]
      if (Array.isArray(rows)) return rows
    } catch {
      // 깨진 값이면 예전 글자로
    }
  }
  return hoursRows(info)
}

/** 관리자가 숨긴 공개 항목인지 — 숨겼으면 섹션 값으로 대신 채우지 않는다 */
export const siteHidden = (info: Record<string, string>, group: PublicFieldGroup) =>
  (info.hidden_fields ?? '').split(',').includes(group)
