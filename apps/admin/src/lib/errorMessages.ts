/**
 * 백엔드 에러 코드 (CLAUDE.md 섹션 5) → 한글 사용자 메시지 매핑.
 * detail이 다른 문자열이거나 모르는 코드면 기본 메시지를 반환한다.
 */

export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: '입력값이 올바르지 않습니다.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '요청한 정보를 찾을 수 없습니다.',
  CONFLICT: '이미 존재하는 데이터입니다.',
  FILE_TOO_LARGE: '파일이 너무 큽니다 (최대 20MB).',
  INVALID_IMAGE: '올바른 이미지 파일이 아닙니다.',
  UNSUPPORTED_FORMAT: '지원하지 않는 파일 형식입니다.',
  EMPTY_FILE: '빈 파일은 업로드할 수 없습니다.',
  PLAN_LIMIT_EXCEEDED: '현재 플랜의 사용 한도를 초과했습니다.',
  RATE_LIMIT_EXCEEDED: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  RECAPTCHA_REQUIRED: 'reCAPTCHA 인증이 필요합니다.',
  RECAPTCHA_FAILED: 'reCAPTCHA 검증에 실패했습니다.',
  INVALID_CONTEXT: '잘못된 업로드 위치입니다.',
  TOO_MANY_FILES: '한 번에 최대 10개까지 업로드할 수 있습니다.',
  NO_FILES: '파일을 첨부해주세요.',
  INTERNAL_ERROR: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  NETWORK_ERROR: '네트워크 연결을 확인해주세요.',
}

export const STATUS_MESSAGES: Record<number, string> = {
  400: '잘못된 요청입니다.',
  401: '로그인이 필요합니다.',
  403: '권한이 없습니다.',
  404: '요청한 정보를 찾을 수 없습니다.',
  409: '이미 존재하는 데이터입니다.',
  413: '파일이 너무 큽니다.',
  422: '입력값을 다시 확인해주세요.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  500: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  502: '서버에 연결할 수 없습니다.',
  503: '서비스가 일시적으로 중단되었습니다.',
}

/**
 * axios 에러 객체에서 사용자에게 보여줄 메시지를 추출.
 */
export function pickErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error

  const e = error as {
    code?: string
    message?: string
    response?: {
      status?: number
      data?: {
        detail?: string | { code?: string; message?: string; field?: string }
        error?: { code?: string; message?: string }
        message?: string
      }
    }
  }

  // 오프라인 / 네트워크 단절
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
    return ERROR_MESSAGES.NETWORK_ERROR
  }

  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') {
    return ERROR_MESSAGES[detail] ?? detail
  }
  if (detail && typeof detail === 'object') {
    if (detail.message) return detail.message
    if (detail.code) return ERROR_MESSAGES[detail.code] ?? detail.code
  }

  const apiError = e?.response?.data?.error
  if (apiError) {
    if (apiError.message) return apiError.message
    if (apiError.code) return ERROR_MESSAGES[apiError.code] ?? apiError.code
  }

  const rawMessage = e?.response?.data?.message
  if (rawMessage) return rawMessage

  const status = e?.response?.status
  if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]

  return '예상치 못한 오류가 발생했습니다.'
}
