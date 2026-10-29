import { Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { FeatureGuard } from '@/components/layout/FeatureGuard'
import { PageFallback } from '@/components/layout/PageFallback'
import { LoginPage } from '@/pages/LoginPage'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { type LazyPage, lazyPage } from '@/lib/lazyPage'

const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage')
const ContentPage = lazyPage(() => import('@/pages/ContentPage'), 'ContentPage')
const SectionEditorPage = lazyPage(() => import('@/pages/SectionEditorPage'), 'SectionEditorPage')
const SnsPage = lazyPage(() => import('@/pages/SnsPage'), 'SnsPage')
const InquiriesPage = lazyPage(() => import('@/pages/InquiriesPage'), 'InquiriesPage')
const SeoPage = lazyPage(() => import('@/pages/SeoPage'), 'SeoPage')
const TemplatesPage = lazyPage(() => import('@/pages/TemplatesPage'), 'TemplatesPage')
const BillingPage = lazyPage(() => import('@/pages/BillingPage'), 'BillingPage')
const AnalyticsPage = lazyPage(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage')
const ReportsPage = lazyPage(() => import('@/pages/ReportsPage'), 'ReportsPage')
const ForbiddenPage = lazyPage(() => import('@/pages/ForbiddenPage'), 'ForbiddenPage')

// 주소 → 페이지 (앞에서부터 먼저 맞는 것). 앱 시작 때 지금 주소의 페이지 코드를
// 로그인 확인과 동시에 받아 둔다 (T-043-A)
const ROUTE_PAGES: [RegExp, LazyPage][] = [
  [/^\/admin\/dashboard\/?$/, DashboardPage],
  [/^\/admin\/content\/?$/, ContentPage],
  [/^\/admin\/content\/[^/]+\/?$/, SectionEditorPage],
  [/^\/admin\/sns\/?$/, SnsPage],
  [/^\/admin\/inquiries\/?$/, InquiriesPage],
  [/^\/admin\/seo\/?$/, SeoPage],
  [/^\/admin\/templates\/?$/, TemplatesPage],
  [/^\/admin\/reports\/?$/, ReportsPage],
  [/^\/admin\/analytics\/?$/, AnalyticsPage],
  [/^\/admin\/billing\/?$/, BillingPage],
  [/^\/admin\/403\/?$/, ForbiddenPage],
  [/^\/?$/, DashboardPage],
]

export const preloadRoute = (pathname: string): void => {
  const hit = ROUTE_PAGES.find(([re]) => re.test(pathname))
  // 실패해도 렌더 때 다시 받으니 여기선 무시
  hit?.[1].preload().catch(() => undefined)
}

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
)

const withFeature = (feature: string, element: ReactNode) => (
  <FeatureGuard feature={feature}>
    <Suspense fallback={<PageFallback />}>{element}</Suspense>
  </FeatureGuard>
)

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/',
    element: <Navigate to="/admin/dashboard" replace />,
  },
  {
    element: <PrivateRoute />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AdminLayout />,
        errorElement: <ErrorPage />,
        children: [
          {
            path: '/admin/dashboard',
            element: withSuspense(<DashboardPage />),
          },
          {
            path: '/admin/content',
            element: withFeature('SECTION_EDITOR', <ContentPage />),
          },
          {
            path: '/admin/content/:sectionId',
            element: withFeature('SECTION_EDITOR', <SectionEditorPage />),
          },
          { path: '/admin/sns', element: withSuspense(<SnsPage />) },
          {
            path: '/admin/inquiries',
            element: withSuspense(<InquiriesPage />),
          },
          {
            path: '/admin/seo',
            element: withFeature('SEO_WIZARD', <SeoPage />),
          },
          {
            path: '/admin/templates',
            element: withFeature('TEMPLATE_SELECT', <TemplatesPage />),
          },
          {
            path: '/admin/reports',
            element: withFeature('AI_MONTHLY_REPORT', <ReportsPage />),
          },
          {
            path: '/admin/analytics',
            element: withFeature('NAVER_ANALYTICS', <AnalyticsPage />),
          },
          { path: '/admin/billing', element: withSuspense(<BillingPage />) },
          { path: '/admin/403', element: withSuspense(<ForbiddenPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
