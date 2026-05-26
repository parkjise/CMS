'use client'

import { create } from 'zustand'
import type { User } from '@cms/types'
import { authApi } from './api'

interface ClientAuthStore {
  user: User | null
  isLoggedIn: boolean
  isEditMode: boolean

  // 페이지 로드 시 호출 → HttpOnly 쿠키 기반 자동 로그인 확인
  initialize: () => Promise<void>

  // 홈페이지 로그인 모달/페이지에서 사용
  login: (email: string, password: string, tenantSlug: string) => Promise<void>

  logout: () => Promise<void>

  // 로그인 상태에서만 가능
  toggleEditMode: () => void
}

export const useClientAuthStore = create<ClientAuthStore>((set, get) => ({
  user: null,
  isLoggedIn: false,
  isEditMode: false,

  initialize: async () => {
    try {
      const { data } = await authApi.get('/auth/me')
      set({ user: data.data, isLoggedIn: true })
    } catch {
      set({ user: null, isLoggedIn: false, isEditMode: false })
    }
  },

  login: async (email, password, tenantSlug) => {
    const { data } = await authApi.post('/auth/login', {
      email,
      password,
      tenant_slug: tenantSlug,
    })
    set({ user: data.data.user, isLoggedIn: true })
  },

  logout: async () => {
    try {
      await authApi.post('/auth/logout')
    } finally {
      set({ user: null, isLoggedIn: false, isEditMode: false })
    }
  },

  toggleEditMode: () => {
    const { isLoggedIn, isEditMode } = get()
    if (!isLoggedIn) return
    set({ isEditMode: !isEditMode })
  },
}))
