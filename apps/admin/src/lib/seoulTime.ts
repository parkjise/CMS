/** 사이트 시간대(한국) 표시 · 입력 (T-224 약관 시행일) */

const SEOUL = 'Asia/Seoul'

/** 2026.12.01 09:00 — 사이트 시간대(한국)로 */
export const seoulDateTime = (iso: string, withTime = true) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SEOUL,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  const date = `${parts.year}.${parts.month}.${parts.day}`
  return withTime ? `${date} ${parts.hour}:${parts.minute}` : date
}

/** 입력칸(한국 시각) → 서버로 보낼 시각 */
export const fromSeoulInput = (local: string) => (local ? `${local}:00+09:00` : null)
