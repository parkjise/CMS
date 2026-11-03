import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/authStore'

export function PrivateRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isInitializing = useAuthStore((s) => s.isInitializing)
  const initialized = useAuthStore((s) => s.initialized)
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    if (!initialized) initialize()
  }, [initialized, initialize])

  if (!initialized || isInitializing) {
    return (
      // 회전 표시만 있으면 '아직 아무것도 안 보임'으로 잡혀 첫 화면이 늦게 측정된다 — 글자를 함께 (T-043-B)
      <div className="min-h-screen flex items-center justify-center gap-3 bg-slate-50 text-sm text-slate-500">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        불러오는 중…
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
