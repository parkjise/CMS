import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

// Public API 클라이언트 — 인증 불필요 (/api/public/* 전용)
export const publicApi = axios.create({
  baseURL: `${BASE_URL}/public`,
  headers: { 'Content-Type': 'application/json' },
})

// 인증 API 클라이언트 — Access Token(메모리) + Refresh Token(HttpOnly 쿠키)
// 백엔드는 Authorization: Bearer 만 받으므로 토큰을 붙이고, 401 이면 쿠키로 한 번 갱신 후 재시도
export const authApi = axios.create({
  baseURL: `${BASE_URL}/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Access Token 은 메모리에만 (XSS 로 새지 않게 저장소에 두지 않는다 — 새로고침 시 쿠키로 다시 받음)
let accessToken: string | null = null

export const getAccessToken = () => accessToken
export const setAccessToken = (token: string | null) => {
  accessToken = token
}

// 갱신은 한 번에 하나만 — Refresh Token 이 회전(rotation)되므로 동시에 두 번 부르면 뒤의 것이 실패
let refreshing: Promise<string | null> | null = null

/** 쿠키의 Refresh Token 으로 새 Access Token 을 받는다 — 실패하면 null */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post(`${BASE_URL}/v1/auth/refresh`, null, { withCredentials: true })
    .then(({ data }) => {
      setAccessToken(data.data.access_token)
      return accessToken
    })
    .catch(() => {
      setAccessToken(null)
      return null
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']

authApi.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

authApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const skip = NO_REFRESH_PATHS.some((p) => original?.url?.startsWith(p))
    if (error.response?.status !== 401 || !original || original._retry || skip) {
      return Promise.reject(error)
    }
    original._retry = true
    const token = await refreshAccessToken()
    if (!token) return Promise.reject(error)
    original.headers.Authorization = `Bearer ${token}`
    return authApi(original)
  },
)
