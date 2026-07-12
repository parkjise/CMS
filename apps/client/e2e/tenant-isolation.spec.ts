import { expect, test } from '@playwright/test'
import { BACKEND_URL, FULL_STACK, apiLogin, authHeader } from './helpers'

// ─────────────────────────────────────────────────────────────────────────
// T-078 멀티 테넌트 격리 검증 (RLS).
// 테넌트 A 토큰으로 테넌트 B 리소스에 접근하면 차단(403/404)되어야 한다.
// 두 테넌트가 시드되어 있어야 하므로 기본 스킵.
// ─────────────────────────────────────────────────────────────────────────

const A = {
  email: process.env.E2E_TENANT_A_EMAIL ?? 'owner@test-tenant.com',
  password: process.env.E2E_TENANT_A_PASSWORD ?? 'tenant1234',
  slug: process.env.E2E_TENANT_A_SLUG ?? 'test-tenant',
}
const B = {
  email: process.env.E2E_TENANT_B_EMAIL ?? 'owner@other-tenant.com',
  password: process.env.E2E_TENANT_B_PASSWORD ?? 'tenant1234',
  slug: process.env.E2E_TENANT_B_SLUG ?? 'other-tenant',
}

test.describe('T-078 멀티 테넌트 격리', () => {
  test.skip(!FULL_STACK, '두 테넌트 시드 + 전체 스택 기동 후 활성화')

  test('테넌트 A 토큰으로 테넌트 B 섹션 접근 시 차단된다', async ({ request }) => {
    const a = await apiLogin(request, A.email, A.password, A.slug)
    const b = await apiLogin(request, B.email, B.password, B.slug)

    // B의 섹션 하나 확보
    const bSections = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/sections`, {
          headers: authHeader(b.accessToken),
        })
      ).json()
    ).data
    expect(bSections.length).toBeGreaterThan(0)
    const bSectionId = bSections[0].id

    // A 토큰으로 B 섹션 수정 시도 → RLS 차단(403 또는 404)
    const res = await request.patch(`${BACKEND_URL}/api/v1/sections/${bSectionId}`, {
      headers: authHeader(a.accessToken),
      data: { main_title: '격리 침해 시도' },
    })
    expect([403, 404]).toContain(res.status())
  })

  test('테넌트 A 토큰으로 테넌트 B 문의 목록에 접근할 수 없다', async ({ request }) => {
    const a = await apiLogin(request, A.email, A.password, A.slug)
    const b = await apiLogin(request, B.email, B.password, B.slug)

    // B에 문의 1건 생성
    await request.post(`${BACKEND_URL}/api/public/inquiries/submit`, {
      data: {
        tenant_slug: B.slug,
        inquiry_type: 'GENERAL',
        name: 'B 방문자',
        phone: '010-0000-0000',
        content: '격리 테스트',
      },
    })

    // A와 B의 문의 목록은 서로 겹치지 않는다 (RLS로 각자 테넌트만 조회)
    const aList = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/inquiries`, {
          headers: authHeader(a.accessToken),
        })
      ).json()
    ).data
    const bList = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/inquiries`, {
          headers: authHeader(b.accessToken),
        })
      ).json()
    ).data

    const aIds = new Set(aList.map((i: { id: string }) => i.id))
    for (const inquiry of bList) {
      expect(aIds.has(inquiry.id)).toBe(false)
    }
  })
})
