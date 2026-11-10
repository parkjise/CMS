import { Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { FeatureGuard } from '@/components/layout/FeatureGuard'
import { PageFallback } from '@/components/layout/PageFallback'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { type LazyPage, lazyPage } from '@/lib/lazyPage'

// 로그인 화면도 따로 — 폼 라이브러리(react-hook-form · zod)가 다른 화면 첫 로딩에 섞이지 않게 (T-043-B)
const LoginPage = lazyPage(() => import('@/pages/LoginPage'), 'LoginPage')
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage')
const ContentPage = lazyPage(() => import('@/pages/ContentPage'), 'ContentPage')
const SectionEditorPage = lazyPage(() => import('@/pages/SectionEditorPage'), 'SectionEditorPage')
const SnsPage = lazyPage(() => import('@/pages/SnsPage'), 'SnsPage')
const InquiriesPage = lazyPage(() => import('@/pages/InquiriesPage'), 'InquiriesPage')
const BoardsPage = lazyPage(() => import('@/pages/BoardsPage'), 'BoardsPage')
const BoardConnectionPage = lazyPage(() => import('@/pages/BoardConnectionPage'), 'BoardConnectionPage')
const BoardFieldsPage = lazyPage(() => import('@/pages/BoardFieldsPage'), 'BoardFieldsPage')
const BoardDesignPage = lazyPage(() => import('@/pages/BoardDesignPage'), 'BoardDesignPage')
const BoardCategoriesPage = lazyPage(() => import('@/pages/BoardCategoriesPage'), 'BoardCategoriesPage')
const BoardPermissionsPage = lazyPage(() => import('@/pages/BoardPermissionsPage'), 'BoardPermissionsPage')
const BoardOperationPage = lazyPage(() => import('@/pages/BoardOperationPage'), 'BoardOperationPage')
const ReportedPostsPage = lazyPage(() => import('@/pages/ReportedPostsPage'), 'ReportedPostsPage')
const PostsOverviewPage = lazyPage(() => import('@/pages/PostsOverviewPage'), 'PostsOverviewPage')
const BoardNewPage = lazyPage(() => import('@/pages/BoardNewPage'), 'BoardNewPage')
const BoardTrashPage = lazyPage(() => import('@/pages/BoardTrashPage'), 'BoardTrashPage')
const AuditLogsPage = lazyPage(() => import('@/pages/AuditLogsPage'), 'AuditLogsPage')
const BoardSettingsPage = lazyPage(() => import('@/pages/BoardSettingsPage'), 'BoardSettingsPage')
const BoardPostsPage = lazyPage(() => import('@/pages/BoardPostsPage'), 'BoardPostsPage')
const BoardPostEditPage = lazyPage(() => import('@/pages/BoardPostEditPage'), 'BoardPostEditPage')
const SeoPage = lazyPage(() => import('@/pages/SeoPage'), 'SeoPage')
const TemplatesPage = lazyPage(() => import('@/pages/TemplatesPage'), 'TemplatesPage')
const BillingPage = lazyPage(() => import('@/pages/BillingPage'), 'BillingPage')
const AnalyticsPage = lazyPage(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage')
const ReportsPage = lazyPage(() => import('@/pages/ReportsPage'), 'ReportsPage')
const ForbiddenPage = lazyPage(() => import('@/pages/ForbiddenPage'), 'ForbiddenPage')

// 주소 → 페이지 (앞에서부터 먼저 맞는 것). 앱 시작 때 지금 주소의 페이지 코드를
// 로그인 확인과 동시에 받아 둔다 (T-043-A)
const ROUTE_PAGES: [RegExp, LazyPage][] = [
  [/^\/login\/?$/, LoginPage],
  [/^\/admin\/dashboard\/?$/, DashboardPage],
  [/^\/admin\/content\/?$/, ContentPage],
  [/^\/admin\/content\/[^/]+\/?$/, SectionEditorPage],
  [/^\/admin\/sns\/?$/, SnsPage],
  [/^\/admin\/inquiries\/?$/, InquiriesPage],
  [/^\/admin\/boards\/?$/, BoardsPage],
  [/^\/admin\/posts\/?$/, PostsOverviewPage],
  [/^\/admin\/posts\/reports\/?$/, ReportedPostsPage],
  [/^\/admin\/boards\/new\/?$/, BoardNewPage],
  [/^\/admin\/boards\/trash\/?$/, BoardTrashPage],
  [/^\/admin\/boards\/[^/]+\/settings\/?$/, BoardSettingsPage],
  [/^\/admin\/boards\/[^/]+\/connection\/?$/, BoardConnectionPage],
  [/^\/admin\/boards\/[^/]+\/fields\/?$/, BoardFieldsPage],
  [/^\/admin\/boards\/[^/]+\/design\/?$/, BoardDesignPage],
  [/^\/admin\/boards\/[^/]+\/categories\/?$/, BoardCategoriesPage],
  [/^\/admin\/boards\/[^/]+\/permissions\/?$/, BoardPermissionsPage],
  [/^\/admin\/boards\/[^/]+\/operation\/?$/, BoardOperationPage],
  [/^\/admin\/boards\/[^/]+\/posts\/?$/, BoardPostsPage],
  [/^\/admin\/boards\/[^/]+\/posts\/.+$/, BoardPostEditPage],
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
    element: withSuspense(<LoginPage />),
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
            path: '/admin/boards',
            element: withFeature('BOARD_MANAGER', <BoardsPage />),
          },
          {
            path: '/admin/posts',
            element: withFeature('BOARD_MANAGER', <PostsOverviewPage />),
          },
          {
            path: '/admin/posts/reports',
            element: withFeature('BOARD_MANAGER', <ReportedPostsPage />),
          },
          {
            path: '/admin/boards/new',
            element: withFeature('BOARD_MANAGER', <BoardNewPage />),
          },
          {
            path: '/admin/boards/trash',
            element: withFeature('BOARD_MANAGER', <BoardTrashPage />),
          },
          {
            path: '/admin/boards/history',
            element: withFeature('BOARD_MANAGER', <AuditLogsPage />),
          },
          {
            path: '/admin/boards/:boardId/settings',
            element: withFeature('BOARD_MANAGER', <BoardSettingsPage />),
          },
          {
            path: '/admin/boards/:boardId/connection',
            element: withFeature('BOARD_MANAGER', <BoardConnectionPage />),
          },
          {
            path: '/admin/boards/:boardId/fields',
            element: withFeature('BOARD_MANAGER', <BoardFieldsPage />),
          },
          {
            path: '/admin/boards/:boardId/design',
            element: withFeature('BOARD_MANAGER', <BoardDesignPage />),
          },
          {
            path: '/admin/boards/:boardId/categories',
            element: withFeature('BOARD_MANAGER', <BoardCategoriesPage />),
          },
          {
            path: '/admin/boards/:boardId/permissions',
            element: withFeature('BOARD_MANAGER', <BoardPermissionsPage />),
          },
          {
            path: '/admin/boards/:boardId/operation',
            element: withFeature('BOARD_MANAGER', <BoardOperationPage />),
          },
          {
            path: '/admin/boards/:boardId/posts',
            element: withFeature('BOARD_MANAGER', <BoardPostsPage />),
          },
          {
            path: '/admin/boards/:boardId/posts/new',
            element: withFeature('BOARD_MANAGER', <BoardPostEditPage />),
          },
          {
            path: '/admin/boards/:boardId/posts/:postId/edit',
            element: withFeature('BOARD_MANAGER', <BoardPostEditPage />),
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
