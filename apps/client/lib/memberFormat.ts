/**
 * 마이페이지 표시 형식 (T-114) — 한국 시간 기준
 * 2026.11.05 (목) · 오전 10:00 · 150,000원
 */
const TZ = 'Asia/Seoul'

const parts = (iso: string) => {
  const date = new Date(iso)
  const get = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...options }).format(date)
  return {
    year: get({ year: 'numeric' }),
    month: get({ month: '2-digit' }),
    day: get({ day: '2-digit' }),
    hour: Number(get({ hour: 'numeric', hourCycle: 'h23' })),
    minute: get({ minute: '2-digit' }).padStart(2, '0'),
    weekday: new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, weekday: 'short' }).format(date),
  }
}

/** 2026.11.05 (목) */
export const formatDate = (iso: string): string => {
  const p = parts(iso)
  return `${p.year}.${p.month}.${p.day} (${p.weekday})`
}

/** 2026.10.24 (요일 없이 — 접수일 · 가입일) */
export const formatDay = (iso: string): string => {
  const p = parts(iso)
  return `${p.year}.${p.month}.${p.day}`
}

/** 오전 10:00 · 오후 02:00 */
export const formatTime = (iso: string): string => {
  const p = parts(iso)
  const half = p.hour < 12 ? '오전' : '오후'
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${half} ${String(hour12).padStart(2, '0')}:${p.minute}`
}

export const formatWon = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`

/** 체크인 + n박 → 체크아웃 날짜 ISO */
export const addDays = (iso: string, days: number): string =>
  new Date(new Date(iso).getTime() + days * 86_400_000).toISOString()
