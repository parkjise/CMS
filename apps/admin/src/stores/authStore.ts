import axios from 'axios'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@cms/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

interface PrefetchedRefresh {
  status: number
  body: { data: { access_token: string; user?: User | null } }
}

declare global {
  interface Window {
    /** index.html 이 미리 보낸 /auth/refresh (vite.config refreshPrefetch, T-043-B) */
    __cmsRefresh?: Promise<PrefetchedRefresh | null>
  }
}

/**
 * 미리 보낸 refresh 결과를 한 번만 꺼낸다. 성공이면 axios 응답 모양으로, 실패(401 등)면 throw
 * (refresh 토큰은 쓰면 바뀌므로 같은 쿠키로 다시 부르지 않는다). 없거나 연결 오류면 null → 직접 요청.
 */
export async function takePrefetchedRefresh(): Promise<{ data: PrefetchedRefresh['body'] } | null> {
  const pending = typeof window === 'undefined' ? undefined : window.__cmsRefresh
  if (!pending) return null
  window.__cmsRefresh = undefined
  const res = await pending
  if (!res) return null
  if (res.status !== 200) throw new Error(`refresh ${res.status}`)
  return { data: res.body }
}

/** 진행 중인 initialize — 같은 refresh 를 두 번 보내지 않게 */
let inflightInit: Promise<void> | null = null

/** access token 의 사용자 id(sub) — 서명 검증 없이 읽기만 한다 (같은 사람인지 비교용) */
export function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const sub = (JSON.parse(json) as { sub?: unknown }).sub
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}

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

      initialize: () => {
        if (get().initialized) return Promise.resolve()
        // 동시에 두 번 불려도(개발 모드 StrictMode 등) refresh 는 한 번만 — 진행 중인 것을 같이 기다린다 (T-043-B)
        inflightInit ??= (async () => {
          set({ isInitializing: true })
          try {
            // 1) 쿠키로 refresh token → 새 access token 발급
            //    index.html 이 앱 JS 를 받는 동안 미리 보낸 요청이 있으면 그 결과를 쓴다 (T-043-B)
            const refreshRes: { data: PrefetchedRefresh['body'] } =
              (await takePrefetchedRefresh()) ??
              (await axios.post(`${BASE_URL}/v1/auth/refresh`, {}, { withCredentials: true }))
            const newToken: string = refreshRes.data.data.access_token

            // refresh 가 내 정보를 함께 주면 그대로 — /me 왕복이 없어 첫 화면이 한 단계 빨라진다 (T-043-B)
            const refreshedUser = refreshRes.data.data.user
            if (refreshedUser) {
              set({ accessToken: newToken, user: refreshedUser, isAuthenticated: true })
              return
            }

            // 2) (예전 서버) 새 access token으로 유저 정보 조회
            const fetchMe = () =>
              axios.get(`${BASE_URL}/v1/auth/me`, {
                withCredentials: true,
                headers: { Authorization: `Bearer ${newToken}` },
              })

            // 저장해 둔 사용자가 같은 사람이면 바로 화면을 열고 /me 는 뒤에서 갱신한다 —
            // 화면 데이터 요청이 /me 를 기다리지 않게 (T-043-A)
            const cached = get().user
            if (cached && cached.id === tokenSubject(newToken)) {
              set({ accessToken: newToken, isAuthenticated: true })
              void fetchMe()
                .then((res) => set({ user: res.data.data as User }))
                .catch(() => undefined) // 실패해도 저장된 정보로 계속 (권한은 서버가 매 요청 확인)
              return
            }

            const meRes = await fetchMe()
            const user: User = meRes.data.data

            set({ accessToken: newToken, user, isAuthenticated: true })
          } catch {
            set({ accessToken: null, user: null, isAuthenticated: false })
          } finally {
            set({ isInitializing: false, initialized: true })
          }
        })().finally(() => {
          inflightInit = null
        })
        return inflightInit
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
