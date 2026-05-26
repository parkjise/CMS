import { createBrowserRouter, Navigate } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AdminLayout } from '@/components/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ContentPage } from '@/pages/ContentPage'
import { SnsPage } from '@/pages/SnsPage'
import { InquiriesPage } from '@/pages/InquiriesPage'
import { SeoPage } from '@/pages/SeoPage'
import { TemplatesPage } from '@/pages/TemplatesPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <Navigate to="/admin/dashboard" replace />,
  },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/dashboard', element: <DashboardPage /> },
          { path: '/admin/content', element: <ContentPage /> },
          { path: '/admin/sns', element: <SnsPage /> },
          { path: '/admin/inquiries', element: <InquiriesPage /> },
          { path: '/admin/seo', element: <SeoPage /> },
          { path: '/admin/templates', element: <TemplatesPage /> },
        ],
      },
    ],
  },
])
