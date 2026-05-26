import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // Refresh Token HttpOnly Cookie 자동 전송
  headers: { 'Content-Type': 'application/json' },
})

// ── 요청 인터셉터: Access Token 헤더 주입 ──
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── 응답 인터셉터: 401 시 토큰 갱신 후 재시도 ──
let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

const drainQueue = (token: string) => {
  pendingQueue.forEach((p) => p.resolve(token))
  pendingQueue = []
}

const rejectQueue = (err: unknown) => {
  pendingQueue.forEach((p) => p.reject(err))
  pendingQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          },
          reject,
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post(
        `${BASE_URL}/v1/auth/refresh`,
        {},
        { withCredentials: true }
      )
      const newToken: string = data.data.access_token
      useAuthStore.getState().updateToken(newToken)
      drainQueue(newToken)
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch (refreshError) {
      rejectQueue(refreshError)
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)
