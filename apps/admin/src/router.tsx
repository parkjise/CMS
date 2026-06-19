import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { PageFallback } from '@/components/layout/PageFallback'
import { LoginPage } from '@/pages/LoginPage'
import { ErrorPage } from '@/pages/ErrorPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ContentPage = lazy(() =>
  import('@/pages/ContentPage').then((m) => ({ default: m.ContentPage })),
)
const SectionEditorPage = lazy(() =>
  import('@/pages/SectionEditorPage').then((m) => ({
    default: m.SectionEditorPage,
  })),
)
const SnsPage = lazy(() =>
  import('@/pages/SnsPage').then((m) => ({ default: m.SnsPage })),
)
const InquiriesPage = lazy(() =>
  import('@/pages/InquiriesPage').then((m) => ({ default: m.InquiriesPage })),
)
const SeoPage = lazy(() =>
  import('@/pages/SeoPage').then((m) => ({ default: m.SeoPage })),
)
const TemplatesPage = lazy(() =>
  import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })),
)
const BillingPage = lazy(() =>
  import('@/pages/BillingPage').then((m) => ({ default: m.BillingPage })),
)
const ForbiddenPage = lazy(() =>
  import('@/pages/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })),
)

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
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
          { path: '/admin/content', element: withSuspense(<ContentPage />) },
          {
            path: '/admin/content/:sectionId',
            element: withSuspense(<SectionEditorPage />),
          },
          { path: '/admin/sns', element: withSuspense(<SnsPage />) },
          {
            path: '/admin/inquiries',
            element: withSuspense(<InquiriesPage />),
          },
          { path: '/admin/seo', element: withSuspense(<SeoPage />) },
          {
            path: '/admin/templates',
            element: withSuspense(<TemplatesPage />),
          },
          { path: '/admin/billing', element: withSuspense(<BillingPage />) },
          { path: '/admin/403', element: withSuspense(<ForbiddenPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
