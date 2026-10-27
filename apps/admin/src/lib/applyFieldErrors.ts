/**
 * 백엔드 검증 에러를 react-hook-form 필드 에러로 매핑.
 *
 * 백엔드 응답 (공통 형식, CLAUDE.md 5):
 *   { success: false, error: { code: 'VALIDATION_ERROR', message, field, details: [{ field, message }] } }
 * 이전 형식도 처리:
 *   { detail: { field, message } } · { detail: [{ loc: ['body', 'x'], msg }] }
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
  field?: string | null
  loc?: string[]
  msg?: string
  message?: string
}

interface ErrorBody {
  error?: DetailField & { details?: DetailField[] | null }
  detail?: unknown
}

const toItems = (data: ErrorBody | undefined): DetailField[] => {
  if (!data) return []
  if (data.error) {
    const { details, ...first } = data.error
    if (Array.isArray(details) && details.length > 0) return details
    return [first]
  }
  const { detail } = data
  if (Array.isArray(detail)) return detail as DetailField[]
  if (detail && typeof detail === 'object') return [detail as DetailField]
  return []
}

export function applyFieldErrors(error: unknown, setError: SetError): boolean {
  const data = (error as { response?: { data?: ErrorBody } })?.response?.data
  const items = toItems(data)

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
