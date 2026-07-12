import * as Sentry from '@sentry/react'

/**
 * Sentry 에러 추적 초기화 (T-083).
 * VITE_SENTRY_DSN이 설정된 경우에만 활성화(미설정 시 no-op).
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
