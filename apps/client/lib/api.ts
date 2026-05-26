import axios from 'axios'

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

// Public API 클라이언트 — 인증 불필요 (/api/public/* 전용)
export const publicApi = axios.create({
  baseURL: `${BASE_URL}/public`,
  headers: { 'Content-Type': 'application/json' },
})

// 인증 API 클라이언트 — HttpOnly 쿠키 자동 전송
export const authApi = axios.create({
  baseURL: `${BASE_URL}/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})
