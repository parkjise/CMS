'use client'

import { create } from 'zustand'
import type { User } from '@cms/types'
import { authApi, getAccessToken, refreshAccessToken, setAccessToken } from './api'

interface ClientAuthStore {
  user: User | null
  isLoggedIn: boolean
  /** initialize() 가 끝났는지 — 끝나기 전의 isLoggedIn=false 는 "아직 모름" */
  isInitialized: boolean

  // 페이지 로드 시 호출 → HttpOnly 쿠키 기반 자동 로그인 확인
  initialize: () => Promise<void>

  // 홈페이지 로그인 모달/페이지에서 사용
  login: (email: string, password: string, tenantSlug: string) => Promise<void>

  logout: () => Promise<void>
}

export const useClientAuthStore = create<ClientAuthStore>((set) => ({
  user: null,
  isLoggedIn: false,
  isInitialized: false,

  initialize: async () => {
    try {
      // 새로고침하면 메모리의 Access Token 이 없다 — 쿠키로 먼저 받아 둔다.
      // (/auth/me 는 쿠키만으로도 200 이라, 안 받아 두면 첫 편집 요청이 매번 401 → 갱신 → 재시도)
      if (!getAccessToken() && !(await refreshAccessToken())) {
        set({ user: null, isLoggedIn: false, isInitialized: true })
        return
      }
      const { data } = await authApi.get('/auth/me')
      set({ user: data.data, isLoggedIn: true, isInitialized: true })
    } catch {
      set({ user: null, isLoggedIn: false, isInitialized: true })
    }
  },

  login: async (email, password, tenantSlug) => {
    const { data } = await authApi.post('/auth/login', {
      email,
      password,
      tenant_slug: tenantSlug,
    })
    setAccessToken(data.data.access_token)
    set({ user: data.data.user, isLoggedIn: true, isInitialized: true })
  },

  logout: async () => {
    try {
      await authApi.post('/auth/logout')
    } finally {
      setAccessToken(null)
      set({ user: null, isLoggedIn: false })
    }
  },
}))
