import { expect, test } from '@playwright/test'
import {
  BACKEND_URL,
  FULL_STACK,
  OTHER_TENANT_ADMIN,
  TEST_TENANT_ADMIN,
  apiLogin,
  authHeader,
  findSection,
  settingValue,
} from './helpers'

// ─────────────────────────────────────────────────────────────────────────
// T-078 멀티 테넌트 격리 — T-078-A 에서 실제 API 로 다시 씀.
// 사업체 A(test-tenant) 관리자가 사업체 B(other-tenant) 데이터를 읽거나 바꿀 수 없어야 한다.
// 앱 계정은 RLS 가 강제되는 일반 권한 계정 — 서비스 코드의 tenant 조건이 빠져도 DB 가 막는다.
// 전제: 시드 TEST_TENANTS (두 사업체), 백엔드
// ─────────────────────────────────────────────────────────────────────────

const A = TEST_TENANT_ADMIN
const B = OTHER_TENANT_ADMIN

test.describe('T-078 멀티 테넌트 격리', () => {
  test.skip(!FULL_STACK, '두 테넌트 시드 + 전체 스택 기동 후 활성화')

  test('A 관리자는 B 의 섹션을 조회 · 수정할 수 없고, B 의 값은 그대로다', async ({
    request,
  }) => {
    const a = await apiLogin(request, A.email, A.password, A.slug)
    const b = await apiLogin(request, B.email, B.password, B.slug)

    const bHero = await findSection(request, b.accessToken, 'HERO_BANNER')
    const bTitle = settingValue(bHero, 'main_title')

    // A 의 섹션 목록에 B 섹션이 없다
    const aList = await request.get(`${BACKEND_URL}/api/v1/sections`, {
      headers: authHeader(a.accessToken),
    })
    const aIds = ((await aList.json()).data as Array<{ id: string }>).map((s) => s.id)
    expect(aIds).not.toContain(bHero.id)

    // A 토큰으로 B 섹션 직접 조회 · 수정 · 숨기기 → 없는 것처럼 404
    const get = await request.get(`${BACKEND_URL}/api/v1/sections/${bHero.id}`, {
      headers: authHeader(a.accessToken),
    })
    expect(get.status()).toBe(404)
    const patch = await request.patch(`${BACKEND_URL}/api/v1/sections/${bHero.id}`, {
      headers: authHeader(a.accessToken),
      data: { settings: [{ field_key: 'main_title', field_value: '격리 침해 시도' }] },
    })
    expect(patch.status()).toBe(404)
    const toggle = await request.patch(`${BACKEND_URL}/api/v1/sections/${bHero.id}/toggle`, {
      headers: authHeader(a.accessToken),
    })
    expect(toggle.status()).toBe(404)

    // 인라인 편집 저장도 B 섹션은 저장되지 않는다
    const save = await request.post(`${BACKEND_URL}/api/v1/edit/batch-save`, {
      headers: authHeader(a.accessToken),
      data: { changes: [{ section_id: bHero.id, field: 'main_title', value: '격리 침해 시도' }] },
    })
    expect((await save.json()).data.saved_count).toBe(0)

    // B 의 값은 그대로
    const bAfter = await findSection(request, b.accessToken, 'HERO_BANNER')
    expect(settingValue(bAfter, 'main_title')).toBe(bTitle)
  })

  test('A 관리자는 B 의 문의를 목록 · 상세 · 처리 어디서도 볼 수 없다', async ({ request }) => {
    const a = await apiLogin(request, A.email, A.password, A.slug)
    const b = await apiLogin(request, B.email, B.password, B.slug)

    const submit = await request.post(`${BACKEND_URL}/api/public/inquiries`, {
      params: { tenant_slug: B.slug },
      data: {
        name: 'B 방문자',
        phone: '010-0000-0000',
        message: '격리 테스트용 문의입니다. A 에게 보이면 안 됩니다.',
      },
    })
    expect(submit.ok(), await submit.text()).toBeTruthy()
    const bInquiryId = (await submit.json()).data.inquiry_id

    const bList = await request.get(`${BACKEND_URL}/api/v1/inquiries`, {
      headers: authHeader(b.accessToken),
    })
    const bIds = ((await bList.json()).data.items as Array<{ id: string }>).map((i) => i.id)
    expect(bIds).toContain(bInquiryId)

    const aList = await request.get(`${BACKEND_URL}/api/v1/inquiries`, {
      headers: authHeader(a.accessToken),
    })
    const aIds = ((await aList.json()).data.items as Array<{ id: string }>).map((i) => i.id)
    expect(aIds).not.toContain(bInquiryId)

    const detail = await request.get(`${BACKEND_URL}/api/v1/inquiries/${bInquiryId}`, {
      headers: authHeader(a.accessToken),
    })
    expect(detail.status()).toBe(404)
    const patch = await request.patch(`${BACKEND_URL}/api/v1/inquiries/${bInquiryId}`, {
      headers: authHeader(a.accessToken),
      data: { status: 'SPAM' },
    })
    expect(patch.status()).toBe(404)

    // B 쪽 문의는 그대로 (A 의 처리 시도가 반영되지 않음)
    const bDetail = await request.get(`${BACKEND_URL}/api/v1/inquiries/${bInquiryId}`, {
      headers: authHeader(b.accessToken),
    })
    expect((await bDetail.json()).data.status).toBe('PENDING')
  })
})
