import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@cms/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

interface AuthState {
  accessToken: string | null
  user: User | null
  tenantSlug: string | null
  isAuthenticated: boolean
  isInitializing: boolean
  initialized: boolean

  login: (email: string, password: string, tenantSlug: string) => Promise<void>
  logout: () => Promise<void>
  initialize: () => Promise<void>
  updateToken: (token: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      tenantSlug: null,
      isAuthenticated: false,
      isInitializing: false,
      initialized: false,

      login: async (email, password, tenantSlug) => {
        const { data } = await axios.post(
          `${BASE_URL}/v1/auth/login`,
          { email, password, tenant_slug: tenantSlug },
          { withCredentials: true }
        )
        const { access_token, user } = data.data
        set({
          accessToken: access_token,
          user,
          tenantSlug,
          isAuthenticated: true,
        })
      },

      logout: async () => {
        try {
          await axios.post(
            `${BASE_URL}/v1/auth/logout`,
            {},
            { withCredentials: true }
          )
        } finally {
          set({
            accessToken: null,
            user: null,
            tenantSlug: null,
            isAuthenticated: false,
            initialized: false,
          })
        }
      },

      initialize: async () => {
        if (get().initialized) return

        set({ isInitializing: true })
        try {
          // 1) 쿠키로 refresh token → 새 access token 발급
          const refreshRes = await axios.post(
            `${BASE_URL}/v1/auth/refresh`,
            {},
            { withCredentials: true }
          )
          const newToken: string = refreshRes.data.data.access_token

          // 2) 새 access token으로 유저 정보 조회
          const meRes = await axios.get(`${BASE_URL}/v1/auth/me`, {
            withCredentials: true,
            headers: { Authorization: `Bearer ${newToken}` },
          })
          const user: User = meRes.data.data

          set({ accessToken: newToken, user, isAuthenticated: true })
        } catch {
          set({ accessToken: null, user: null, isAuthenticated: false })
        } finally {
          set({ isInitializing: false, initialized: true })
        }
      },

      updateToken: (token) => set({ accessToken: token }),

      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          tenantSlug: null,
          isAuthenticated: false,
          initialized: false,
        }),
    }),
    {
      name: 'cms-auth',
      partialize: (state) => ({
        user: state.user,
        tenantSlug: state.tenantSlug,
      }),
    }
  )
)
