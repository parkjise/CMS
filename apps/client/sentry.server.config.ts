import * as Sentry from '@sentry/nextjs'

// 서버(Node) 런타임 Sentry 초기화 (T-083). DSN 미설정 시 no-op.
if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
