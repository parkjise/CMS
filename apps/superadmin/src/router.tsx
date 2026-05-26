import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { useSuperAuthStore } from '@/stores/superAuthStore'

function PrivateRoute() {
  const isAuthenticated = useSuperAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">CMS 슈퍼 어드민</h1>
        <p className="text-sm text-slate-400 text-center mt-6">로그인 폼 — 추후 구현</p>
      </div>
    </div>
  )
}

function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">슈퍼 어드민 대시보드</h1>
      <p className="text-sm text-slate-500">테넌트 관리 · 기능 배포 · 모니터링 — 추후 구현</p>
    </div>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  {
    element: <PrivateRoute />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
    ],
  },
])
