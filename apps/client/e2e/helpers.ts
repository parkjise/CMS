import { type APIRequestContext, expect } from '@playwright/test'

// 크로스 앱 E2E는 전체 스택(백엔드+DB 시드, 3개 프론트)이 필요하다.
// 기본은 스킵되며, 스택을 띄운 뒤 E2E_FULL_STACK=1 로 활성화한다.
export const FULL_STACK = !!process.env.E2E_FULL_STACK

// 앱별 베이스 URL (환경변수로 오버라이드 가능)
export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000'
export const CLIENT_URL = process.env.E2E_CLIENT_URL ?? 'http://localhost:3000'
export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:3001'
export const SYSTEM_URL = process.env.E2E_SYSTEM_URL ?? 'http://localhost:3002'

export interface LoginResult {
  accessToken: string
  tenantId?: string
}

/** POST /api/v1/auth/login — 액세스 토큰 반환 (테넌트/슈퍼 공통) */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
  tenantSlug?: string
): Promise<LoginResult> {
  const res = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
    data: { email, password, tenant_slug: tenantSlug },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return {
    accessToken: body.data.access_token,
    tenantId: body.data.user?.tenant_id,
  }
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}
