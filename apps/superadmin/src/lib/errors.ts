/**
 * 백엔드 공통 에러 형식 `{success:false, error:{code, message}}` (CLAUDE.md 5) 에서
 * 사용자에게 보여줄 문구를 꺼낸다. 서버 문구(예: "이미 사용 중인 slug입니다.")가 없으면 fallback.
 */
interface ErrorResponse {
  response?: { data?: { error?: { message?: string | null } | null } | null }
}

export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const message = (error as ErrorResponse | null)?.response?.data?.error?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}
