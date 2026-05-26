import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/authStore'

export function PrivateRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
