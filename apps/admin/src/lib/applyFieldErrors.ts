/**
 * 백엔드 검증 에러를 react-hook-form 필드 에러로 매핑.
 *
 * 백엔드 응답 형태 예시:
 *   { detail: { field: 'recipient_phone', message: '...' } }
 *   { detail: [{ loc: ['body', 'recipient_phone'], msg: '...' }] }  // FastAPI 기본
 *
 * useCase:
 *   try { await mutate(values) }
 *   catch (err) { applyFieldErrors(err, form.setError) }
 */

type SetError = (
  name: string,
  error: { type: string; message: string }
) => void

interface DetailField {
  field?: string
  loc?: string[]
  msg?: string
  message?: string
}

export function applyFieldErrors(error: unknown, setError: SetError): boolean {
  const detail = (
    error as { response?: { data?: { detail?: unknown } } }
  )?.response?.data?.detail

  if (!detail) return false

  const items: DetailField[] = Array.isArray(detail)
    ? (detail as DetailField[])
    : typeof detail === 'object'
      ? [detail as DetailField]
      : []

  let matched = false
  for (const item of items) {
    const field =
      item.field ??
      (Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : undefined)
    const message = item.message ?? item.msg
    if (field && message) {
      setError(String(field), { type: 'server', message })
      matched = true
    }
  }
  return matched
}
