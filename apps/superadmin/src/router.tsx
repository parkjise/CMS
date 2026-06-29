import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { SuperAdminLayout } from '@/components/layout/SuperAdminLayout'
import { AnnouncementsPage } from '@/pages/AnnouncementsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FeaturesPage } from '@/pages/FeaturesPage'
import { LoginPage } from '@/pages/LoginPage'
import { MonitoringPage } from '@/pages/MonitoringPage'
import { RevenuePage } from '@/pages/RevenuePage'
import { TenantDetailPage } from '@/pages/TenantDetailPage'
import { TenantsPage } from '@/pages/TenantsPage'
import { useSuperAuthStore } from '@/stores/superAuthStore'

function PrivateRoute() {
  const isAuthenticated = useSuperAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <SuperAdminLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/tenants', element: <TenantsPage /> },
          { path: '/tenants/:id', element: <TenantDetailPage /> },
          { path: '/features', element: <FeaturesPage /> },
          { path: '/announcements', element: <AnnouncementsPage /> },
          { path: '/monitoring', element: <MonitoringPage /> },
          { path: '/revenue', element: <RevenuePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
