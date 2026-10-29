import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toast } from '@cms/ui'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OfflineBanner } from '@/components/OfflineBanner'
import { queryClient } from '@/lib/queryClient'
import { preloadRoute, router } from '@/router'
import { initSentry } from '@/lib/sentry'
import './index.css'

initSentry()
// 지금 주소의 페이지 코드를 로그인 확인과 동시에 받기 시작 (T-043-A)
preloadRoute(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        <RouterProvider router={router} />
        <Toast />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
