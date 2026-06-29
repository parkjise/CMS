import axios from 'axios'
import { useSuperAuthStore } from '@/stores/superAuthStore'

// 슈퍼 어드민 전용 API (baseURL: /api/super → 호출 시 /v1/... 를 붙인다)
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/super'

export const superApi = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

superApi.interceptors.request.use((config) => {
  const token = useSuperAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

superApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useSuperAuthStore.getState().clearAuth()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
