import type { DayHours, WeekdayKey, WeeklyHours } from '@cms/types'

/**
 * 요일별 운영시간 (T-222) — 홈페이지(apps/client/lib/siteHours.ts)와 같은 규칙.
 * 홈페이지는 공통 패키지 런타임 코드를 쓰지 않아 미리보기용으로 따로 둔다.
 */

export const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
}

export interface HoursRow {
  days: string
  time: string
}

const overnight = (h: DayHours) =>
  Boolean(h.open && h.close && h.close !== '24:00' && h.close <= h.open)

export function dayTime(h: DayHours): string {
  if (h.status === 'closed') return '휴무'
  if (h.status === '24h') return '24시간'
  const time = `${h.open} ~ ${overnight(h) ? '다음 날 ' : ''}${h.close}`
  return h.break_start && h.break_end ? `${time} (점심 ${h.break_start} ~ ${h.break_end})` : time
}

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

export const hasWeeklyHours = (weekly?: WeeklyHours | null): weekly is WeeklyHours =>
  Boolean(weekly && WEEKDAYS.some((day) => weekly[day]))

const workday = (): DayHours => ({
  status: 'open',
  open: '09:00',
  close: '18:00',
  break_start: null,
  break_end: null,
})
const dayOff = (): DayHours => ({
  status: 'closed',
  open: null,
  close: null,
  break_start: null,
  break_end: null,
})

/** 요일별 표를 처음 켤 때 — 월~금 09:00 ~ 18:00, 주말 휴무 */
export const defaultWeek = (): Record<WeekdayKey, DayHours> => ({
  mon: workday(),
  tue: workday(),
  wed: workday(),
  thu: workday(),
  fri: workday(),
  sat: dayOff(),
  sun: dayOff(),
})
