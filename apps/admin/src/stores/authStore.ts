import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@cms/types'

interface AuthState {
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  updateToken: (token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token, user) =>
        set({ accessToken: token, user, isAuthenticated: true }),

      clearAuth: () =>
        set({ accessToken: null, user: null, isAuthenticated: false }),

      updateToken: (token) =>
        set({ accessToken: token }),
    }),
    {
      name: 'cms-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
