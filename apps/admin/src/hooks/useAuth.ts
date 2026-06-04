import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const initialize = useAuthStore((s) => s.initialize)

  return { user, isAuthenticated, tenantSlug, login, logout, initialize }
}
