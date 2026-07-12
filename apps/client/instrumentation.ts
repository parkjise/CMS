import * as Sentry from '@sentry/nextjs'

// 서버/엣지 런타임에서 Sentry 서버 설정 로드 (T-083).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
}

// App Router 서버 컴포넌트/라우트 에러 캡처
export const onRequestError = Sentry.captureRequestError
