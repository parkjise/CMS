import { Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { APP_BASE } from '@/lib/appPath'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { FeatureGuard } from '@/components/layout/FeatureGuard'
import { PageFallback } from '@/components/layout/PageFallback'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { BOARD_SECTIONS } from '@/lib/boardWorkspace'
import { type LazyPage, lazyPage } from '@/lib/lazyPage'
import { BoardSectionRedirect } from '@/components/boards/BoardSectionNav'
import { SITE_HOME } from '@/components/layout/navigation'
import { ContentRedirect } from '@/components/pages/ContentRedirect'

// 로그인 화면도 따로 — 폼 라이브러리(react-hook-form · zod)가 다른 화면 첫 로딩에 섞이지 않게 (T-043-B)
const LoginPage = lazyPage(() => import('@/pages/LoginPage'), 'LoginPage')
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage')
// 페이지 관리 (T-238) — 예전 콘텐츠 편집은 페이지별 [섹션] 탭으로
const PagesPage = lazyPage(() => import('@/pages/PagesPage'), 'PagesPage')
const PageDetailPage = lazyPage(() => import('@/pages/PageDetailPage'), 'PageDetailPage')
const SectionEditorPage = lazyPage(() => import('@/pages/SectionEditorPage'), 'SectionEditorPage')
const ContentItemsPage = lazyPage(
  () => import('@/pages/ContentItemsPage'),
  'ContentItemsPage'
)
const ContentItemEditPage = lazyPage(
  () => import('@/pages/ContentItemEditPage'),
  'ContentItemEditPage'
)
const ContentTaxonomyPage = lazyPage(
  () => import('@/pages/ContentTaxonomyPage'),
  'ContentTaxonomyPage'
)
const ContentTypesPage = lazyPage(
  () => import('@/pages/ContentTypesPage'),
  'ContentTypesPage'
)
const ContentTypeDetailPage = lazyPage(
  () => import('@/pages/ContentTypeDetailPage'),
  'ContentTypeDetailPage'
)
const SnsPage = lazyPage(() => import('@/pages/SnsPage'), 'SnsPage')
const InquiriesPage = lazyPage(() => import('@/pages/InquiriesPage'), 'InquiriesPage')
const BoardsPage = lazyPage(() => import('@/pages/BoardsPage'), 'BoardsPage')
// 게시판 상세 탭 4개 — 설정 · 필드와 카테고리는 합친 화면 (T-212)
const BoardSetupPage = lazyPage(() => import('@/pages/BoardSetupPage'), 'BoardSetupPage')
const BoardStructurePage = lazyPage(() => import('@/pages/BoardStructurePage'), 'BoardStructurePage')
const BoardDesignPage = lazyPage(() => import('@/pages/BoardDesignPage'), 'BoardDesignPage')
const ReportedPostsPage = lazyPage(() => import('@/pages/ReportedPostsPage'), 'ReportedPostsPage')
const PostsOverviewPage = lazyPage(() => import('@/pages/PostsOverviewPage'), 'PostsOverviewPage')
const BoardNewPage = lazyPage(() => import('@/pages/BoardNewPage'), 'BoardNewPage')
const BoardTrashPage = lazyPage(() => import('@/pages/BoardTrashPage'), 'BoardTrashPage')
const AuditLogsPage = lazyPage(() => import('@/pages/AuditLogsPage'), 'AuditLogsPage')
const BoardWorkspacePage = lazyPage(() => import('@/pages/BoardWorkspacePage'), 'BoardWorkspacePage')
const BoardPostsPage = lazyPage(() => import('@/pages/BoardPostsPage'), 'BoardPostsPage')
const BoardPostEditPage = lazyPage(() => import('@/pages/BoardPostEditPage'), 'BoardPostEditPage')
// 사이트 관리 (T-221) — 기본정보 · 메뉴 · 약관 · SEO · AEO · GEO
const SiteInfoPage = lazyPage(() => import('@/pages/SiteInfoPage'), 'SiteInfoPage')
const SiteMenuPage = lazyPage(() => import('@/pages/SiteMenuPage'), 'SiteMenuPage')
const SeoPage = lazyPage(() => import('@/pages/SeoPage'), 'SeoPage')
const AeoPage = lazyPage(() => import('@/pages/AeoPage'), 'AeoPage')
const GeoPage = lazyPage(() => import('@/pages/GeoPage'), 'GeoPage')
const PoliciesPage = lazyPage(() => import('@/pages/PoliciesPage'), 'PoliciesPage')
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
  [/^\/admin\/pages\/?$/, PagesPage],
  [/^\/admin\/pages\/[^/]+\/sections\/[^/]+\/?$/, SectionEditorPage],
  [/^\/admin\/pages\/[^/]+\/?$/, PageDetailPage],
  [/^\/admin\/content\/?$/, PageDetailPage],
  [/^\/admin\/content\/[^/]+\/?$/, SectionEditorPage],
  [/^\/admin\/contents\/types\/?$/, ContentTypesPage],
  [/^\/admin\/contents\/types\/[^/]+\/?$/, ContentTypeDetailPage],
  [/^\/admin\/contents\/taxonomy\/?$/, ContentTaxonomyPage],
  [/^\/admin\/contents\/?$/, ContentItemsPage],
  [/^\/admin\/contents\/[^/]+\/?$/, ContentItemEditPage],
  [/^\/admin\/sns\/?$/, SnsPage],
  [/^\/admin\/inquiries\/?$/, InquiriesPage],
  [/^\/admin\/boards\/?$/, BoardsPage],
  [/^\/admin\/posts\/?$/, PostsOverviewPage],
  [/^\/admin\/posts\/reports\/?$/, ReportedPostsPage],
  [/^\/admin\/boards\/new\/?$/, BoardNewPage],
  [/^\/admin\/boards\/trash\/?$/, BoardTrashPage],
  [/^\/admin\/boards\/[^/]+\/settings\/?$/, BoardSetupPage],
  [/^\/admin\/boards\/[^/]+\/fields\/?$/, BoardStructurePage],
  [/^\/admin\/boards\/[^/]+\/design\/?$/, BoardDesignPage],
  [/^\/admin\/boards\/[^/]+\/posts\/?$/, BoardPostsPage],
  [/^\/admin\/boards\/[^/]+\/posts\/.+$/, BoardPostEditPage],
  [/^\/admin\/site\/info\/?$/, SiteInfoPage],
  [/^\/admin\/site\/menu\/?$/, SiteMenuPage],
  [/^\/admin\/site\/policies\/?$/, PoliciesPage],
  [/^\/admin\/site\/seo\/?$/, SeoPage],
  [/^\/admin\/site\/aeo\/?$/, AeoPage],
  [/^\/admin\/site\/geo\/?$/, GeoPage],
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
            path: '/admin/pages',
            element: withFeature('SECTION_EDITOR', <PagesPage />),
          },
          {
            path: '/admin/pages/:pageKey',
            element: withFeature('SECTION_EDITOR', <PageDetailPage />),
          },
          {
            path: '/admin/pages/:pageKey/sections/:sectionId',
            element: withFeature('SECTION_EDITOR', <SectionEditorPage />),
          },
          // 예전 콘텐츠 편집 주소 (T-238)
          { path: '/admin/content', element: <ContentRedirect /> },
          { path: '/admin/content/:sectionId', element: <ContentRedirect /> },
          // 콘텐츠 관리 (T-255 · T-256)
          {
            path: '/admin/contents',
            element: withFeature('CONTENT_MANAGE', <ContentItemsPage />),
          },
          {
            path: '/admin/contents/taxonomy',
            element: withFeature('CONTENT_MANAGE', <ContentTaxonomyPage />),
          },
          {
            path: '/admin/contents/new',
            element: withFeature('CONTENT_MANAGE', <ContentItemEditPage />),
          },
          {
            path: '/admin/contents/:itemId',
            element: withFeature('CONTENT_MANAGE', <ContentItemEditPage />),
          },
          {
            path: '/admin/contents/types',
            element: withFeature('CONTENT_MANAGE', <ContentTypesPage />),
          },
          {
            path: '/admin/contents/types/:typeId',
            element: withFeature('CONTENT_MANAGE', <ContentTypeDetailPage />),
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
          // 하위 메뉴 → 마지막으로 작업한 게시판의 그 화면 (T-187)
          ...BOARD_SECTIONS.map((section) => ({
            path: `/admin/boards/${section}`,
            element: withFeature('BOARD_MANAGER', <BoardWorkspacePage />),
          })),
          {
            path: '/admin/boards/:boardId/settings',
            element: withFeature('BOARD_MANAGER', <BoardSetupPage />),
          },
          {
            path: '/admin/boards/:boardId/fields',
            element: withFeature('BOARD_MANAGER', <BoardStructurePage />),
          },
          {
            path: '/admin/boards/:boardId/design',
            element: withFeature('BOARD_MANAGER', <BoardDesignPage />),
          },
          // 예전 탭 주소 → 합친 화면의 그 구역 (T-212)
          ...(
            [
              ['connection', 'settings'],
              ['permissions', 'settings'],
              ['operation', 'settings'],
              ['categories', 'fields'],
            ] as const
          ).map(([section, page]) => ({
            path: `/admin/boards/:boardId/${section}`,
            element: <BoardSectionRedirect page={page} section={section} />,
          })),
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
          { path: '/admin/site', element: <Navigate to={SITE_HOME} replace /> },
          { path: SITE_HOME, element: withSuspense(<SiteInfoPage />) },
          { path: '/admin/site/menu', element: withSuspense(<SiteMenuPage />) },
          { path: '/admin/site/policies', element: withSuspense(<PoliciesPage />) },
          { path: '/admin/site/seo', element: withFeature('SEO_WIZARD', <SeoPage />) },
          { path: '/admin/site/aeo', element: withFeature('SEO_WIZARD', <AeoPage />) },
          { path: '/admin/site/geo', element: withFeature('SEO_WIZARD', <GeoPage />) },
          // 사이트 관리로 옮기기 전 주소 (T-221) — 즐겨찾기 · 안내 링크
          { path: '/admin/seo', element: <Navigate to="/admin/site/seo" replace /> },
          { path: '/admin/policies', element: <Navigate to="/admin/site/policies" replace /> },
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
],
  // GitHub Pages 개발 배포처럼 하위 경로에 놓일 때 (T-236)
  { basename: APP_BASE || undefined }
)
