// 게시판 날짜 표기 — 서버(UTC)와 브라우저 어디서 그려도 같도록 한국 시간 기준
const parts = (iso: string) => {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00+09:00` : iso)
  const f = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => f.find((p) => p.type === type)?.value ?? ''
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') }
}

/** 2026. 10. 20 */
export const dotDate = (iso: string) => {
  const { y, m, d } = parts(iso)
  return `${y}. ${m}. ${d}`
}

/** 2026-10-23 10:12 */
export const dashDateTime = (iso: string) => {
  const { y, m, d, h, min } = parts(iso)
  return `${y}-${m}-${d} ${h}:${min}`
}

/** 본문 텍스트(관리자·작성자 입력) → 빈 줄 기준 문단 */
export const toParagraphs = (text: string | null | undefined) =>
  (text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
