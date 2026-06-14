import { createBrowserRouter, Navigate } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ContentPage } from '@/pages/ContentPage'
import { SectionEditorPage } from '@/pages/SectionEditorPage'
import { SnsPage } from '@/pages/SnsPage'
import { InquiriesPage } from '@/pages/InquiriesPage'
import { SeoPage } from '@/pages/SeoPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { BillingPage } from '@/pages/BillingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { ErrorPage } from '@/pages/ErrorPage'

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
          { path: '/admin/dashboard', element: <DashboardPage /> },
          { path: '/admin/content', element: <ContentPage /> },
          {
            path: '/admin/content/:sectionId',
            element: <SectionEditorPage />,
          },
          { path: '/admin/sns', element: <SnsPage /> },
          { path: '/admin/inquiries', element: <InquiriesPage /> },
          { path: '/admin/seo', element: <SeoPage /> },
          { path: '/admin/templates', element: <TemplatesPage /> },
          { path: '/admin/billing', element: <BillingPage /> },
          { path: '/admin/403', element: <ForbiddenPage /> },
        ],
      },
    ],
  },
  // catch-all 404
  { path: '*', element: <NotFoundPage /> },
])
