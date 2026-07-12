import * as Sentry from '@sentry/nextjs'

// 브라우저(클라이언트) 런타임 Sentry 초기화 (T-083). DSN 미설정 시 no-op.
// Next.js 15.3+ 는 instrumentation-client.ts를 자동 로드한다.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    sendDefaultPii: false,
  })
}
