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

// ── 편집 모드 E2E (T-066-A) — 테스트 전 값을 읽고, 끝나면 그대로 되돌린다 ──

export const TEST_TENANT_ADMIN = {
  email: 'admin@test-tenant.com',
  password: 'password123',
  slug: 'test-tenant',
}

export interface SectionSettingRow {
  field_key: string
  field_value: string | null
}

export interface AdminSection {
  id: string
  section_type: string
  settings: SectionSettingRow[]
}

/** GET /api/v1/sections — 섹션 타입으로 첫 섹션 (시드: HERO_BANNER · GALLERY · CONTACT) */
export async function findSection(
  request: APIRequestContext,
  token: string,
  sectionType: string
): Promise<AdminSection> {
  const res = await request.get(`${BACKEND_URL}/api/v1/sections`, {
    headers: authHeader(token),
  })
  expect(res.ok()).toBeTruthy()
  const sections = (await res.json()).data as AdminSection[]
  const section = sections.find((s) => s.section_type === sectionType)
  expect(section, `test-tenant 에 ${sectionType} 섹션 없음 — scripts/seed.py 실행`).toBeTruthy()
  return section!
}

export const settingValue = (section: AdminSection, key: string): string | null =>
  section.settings.find((s) => s.field_key === key)?.field_value ?? null

/** POST /api/v1/edit/batch-save — 값 되돌리기 (null 은 빈 값) */
export async function saveFields(
  request: APIRequestContext,
  token: string,
  sectionId: string,
  fields: Record<string, string | null>
): Promise<void> {
  const res = await request.post(`${BACKEND_URL}/api/v1/edit/batch-save`, {
    headers: authHeader(token),
    data: {
      changes: Object.entries(fields).map(([field, value]) => ({
        section_id: sectionId,
        field,
        value,
      })),
    },
  })
  expect(res.ok()).toBeTruthy()
  expect((await res.json()).data.failed_count).toBe(0)
}

// ── 통합 E2E (T-078-A) ──

/** 슈퍼 어드민 계정 — 시드 값 (scripts/seed.py: SUPER_ADMIN_EMAIL · SUPER_ADMIN_PASSWORD) */
export const SUPER_ADMIN = {
  email: process.env.E2E_SUPER_EMAIL ?? 'admin@cms.io',
  password: process.env.E2E_SUPER_PASSWORD ?? '',
}

/** 격리 테스트의 "다른 사업체" — 시드 TEST_TENANTS */
export const OTHER_TENANT_ADMIN = {
  email: 'admin@other-tenant.com',
  password: 'password123',
  slug: 'other-tenant',
}

/** POST /api/super/v1/auth/login — 2FA 없는 슈퍼 어드민 토큰 */
export async function superLogin(request: APIRequestContext): Promise<string> {
  expect(SUPER_ADMIN.password, 'E2E_SUPER_PASSWORD 를 시드의 SUPER_ADMIN_PASSWORD 로').toBeTruthy()
  const res = await request.post(`${BACKEND_URL}/api/super/v1/auth/login`, {
    data: { email: SUPER_ADMIN.email, password: SUPER_ADMIN.password },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.data.requires_2fa).toBe(false)
  return body.data.access_token
}
