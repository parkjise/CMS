import type { DayHours, PublicFieldGroup, WeekdayKey, WeeklyHours } from '@cms/types'

/** 요일별 운영시간 (T-222) — 관리자 미리보기(apps/admin/src/lib/siteHours.ts)와 같은 규칙 */

export const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
}

const SCHEMA_DAY: Record<WeekdayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

export interface HoursRow {
  /** 월 · 월~금 · 평일 */
  days: string
  /** 09:00 ~ 18:00 (점심 12:00 ~ 13:00) · 휴무 · 24시간 */
  time: string
}

/** 닫는 시각이 여는 시각보다 이르면 다음 날 새벽에 닫는다 */
const overnight = (h: DayHours) =>
  Boolean(h.open && h.close && h.close !== '24:00' && h.close <= h.open)

export function dayTime(h: DayHours): string {
  if (h.status === 'closed') return '휴무'
  if (h.status === '24h') return '24시간'
  const time = `${h.open} ~ ${overnight(h) ? '다음 날 ' : ''}${h.close}`
  return h.break_start && h.break_end ? `${time} (점심 ${h.break_start} ~ ${h.break_end})` : time
}

export const hasWeeklyHours = (weekly?: WeeklyHours | null): weekly is WeeklyHours =>
  Boolean(weekly && WEEKDAYS.some((day) => weekly[day]))

/** 이어지는 요일이 같은 시간이면 한 줄로 묶는다 — 월~금 09:00 ~ 18:00 */
export function weeklyRows(weekly: WeeklyHours): HoursRow[] {
  const rows: HoursRow[] = []
  let run: { first: number; last: number; time: string } | null = null
  const flush = () => {
    if (!run) return
    const first = DAY_LABEL[WEEKDAYS[run.first]]
    const last = DAY_LABEL[WEEKDAYS[run.last]]
    rows.push({ days: run.first === run.last ? first : `${first}~${last}`, time: run.time })
    run = null
  }
  WEEKDAYS.forEach((day, index) => {
    const hours = weekly[day]
    if (!hours) {
      flush()
      return
    }
    const time = dayTime(hours)
    if (run && run.time === time && run.last === index - 1) {
      run.last = index
      return
    }
    flush()
    run = { first: index, last: index, time }
  })
  flush()
  return rows
}

interface HoursSource {
  weekly_hours?: WeeklyHours | null
  hours_weekday?: string | null
  hours_saturday?: string | null
}

/** 요일별 표가 있으면 표, 없으면 예전 자유 글자(평일 · 토요일) */
export function hoursRows(info: HoursSource): HoursRow[] {
  if (hasWeeklyHours(info.weekly_hours)) return weeklyRows(info.weekly_hours)
  const rows: HoursRow[] = []
  if (info.hours_weekday) rows.push({ days: '평일', time: info.hours_weekday })
  if (info.hours_saturday) rows.push({ days: '토요일', time: info.hours_saturday })
  return rows
}

/** schema.org openingHoursSpecification — 점심시간은 둘로 나눈다, 같은 시간 요일은 묶는다 */
export function openingHoursSpecification(weekly: WeeklyHours): Record<string, unknown>[] {
  const groups = new Map<string, { opens: string; closes: string; days: string[] }>()
  const add = (day: WeekdayKey, opens: string, closes: string) => {
    const key = `${opens}-${closes}`
    const group = groups.get(key) ?? { opens, closes, days: [] }
    group.days.push(SCHEMA_DAY[day])
    groups.set(key, group)
  }
  for (const day of WEEKDAYS) {
    const h = weekly[day]
    if (!h || h.status === 'closed') continue
    if (h.status === '24h') {
      add(day, '00:00', '23:59')
      continue
    }
    if (!h.open || !h.close) continue
    const close = h.close === '24:00' ? '23:59' : h.close
    if (h.break_start && h.break_end) {
      add(day, h.open, h.break_start)
      add(day, h.break_end, close)
    } else {
      add(day, h.open, close)
    }
  }
  return [...groups.values()].map((g) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: g.days.length === 1 ? g.days[0] : g.days,
    opens: g.opens,
    closes: g.closes,
  }))
}

/** 관리자가 숨긴 공개 항목인지 — 숨겼으면 섹션 값 등으로 대신 채우지 않는다 */
export const isHidden = (
  info: { hidden_fields?: PublicFieldGroup[] } | null | undefined,
  group: PublicFieldGroup
) => Boolean(info?.hidden_fields?.includes(group))
