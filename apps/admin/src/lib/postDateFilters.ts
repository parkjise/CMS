/** 브라우저의 달력 날짜를 시작 포함 · 끝 제외인 UTC 조회 범위로 바꾼다. */
const INVALID_DATE = '올바른 작성일을 입력해주세요.'

const localDate = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(`${value}T00:00:00`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    year < 1 ||
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  )
    throw new Error(INVALID_DATE)
  return date
}

export const postDateFilters = (start: string, end: string) => {
  if (start && end && start > end) throw new Error('작성일 시작은 종료일보다 늦을 수 없습니다.')
  const from = start ? localDate(start) : undefined
  const before = end ? localDate(end) : undefined
  // 24시간을 더하면 서머타임 전환일이 어긋날 수 있으므로 다음 달력 날짜로 이동한다.
  if (before) before.setDate(before.getDate() + 1)
  if (
    [from, before].some(
      (date) => date && (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    )
  )
    throw new Error(INVALID_DATE)
  return { created_from: from?.toISOString(), created_before: before?.toISOString() }
}
