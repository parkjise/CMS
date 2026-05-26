import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@cms/types'

interface SuperAuthState {
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  updateToken: (token: string) => void
}

export const useSuperAuthStore = create<SuperAuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => set({ accessToken: token, user, isAuthenticated: true }),
      clearAuth: () => set({ accessToken: null, user: null, isAuthenticated: false }),
      updateToken: (token) => set({ accessToken: token }),
    }),
    {
      name: 'cms-super-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
