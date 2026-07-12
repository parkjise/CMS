import { expect, test } from '@playwright/test'
import { ADMIN_URL, BACKEND_URL, FULL_STACK, SYSTEM_URL, apiLogin, authHeader } from './helpers'

// ─────────────────────────────────────────────────────────────────────────
// T-078 전체 통합 시나리오 (E2E).
// 크로스 앱(슈퍼어드민→관리자→홈페이지) + 백엔드 계약을 관통 검증한다.
// 전체 스택이 필요하므로 기본 스킵. 스택 기동 후:
//   E2E_FULL_STACK=1 pnpm --filter @cms/client test:e2e
// 로 활성화한다. (슈퍼/테넌트 계정은 scripts/seed.py 시드값 기준)
// ─────────────────────────────────────────────────────────────────────────

const SUPER_EMAIL = process.env.E2E_SUPER_EMAIL ?? 'admin@cms.io'
const SUPER_PASSWORD = process.env.E2E_SUPER_PASSWORD ?? 'superadmin1234'
const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL ?? 'owner@test-tenant.com'
const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD ?? 'tenant1234'
const TENANT_SLUG = 'test-tenant'

test.describe('T-078 전체 통합 시나리오', () => {
  test.skip(!FULL_STACK, '전체 스택(백엔드+시드, 3개 프론트) 기동 후 E2E_FULL_STACK=1로 활성화')

  // 1. 슈퍼 어드민 → 신규 테넌트 생성
  test('시나리오 1: 슈퍼 어드민이 신규 테넌트를 생성한다', async ({ request }) => {
    const { accessToken } = await apiLogin(request, SUPER_EMAIL, SUPER_PASSWORD)
    const slug = `e2e-${Date.now()}`

    const res = await request.post(`${BACKEND_URL}/api/super/v1/tenants`, {
      headers: authHeader(accessToken),
      data: { slug, name: 'E2E 신규 사업체', template_type: 'GENERAL', plan_type: 'BASIC' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.data.slug).toBe(slug)
  })

  // 2. 테넌트 어드민 로그인 → 대시보드 확인
  test('시나리오 2: 테넌트 어드민 로그인 후 대시보드 통계를 조회한다', async ({
    page,
    request,
  }) => {
    // UI 로그인 (admin 앱)
    await page.goto(`${ADMIN_URL}/login`)
    await page.getByLabel(/이메일/).fill(TENANT_EMAIL)
    await page.getByLabel(/비밀번호/).fill(TENANT_PASSWORD)
    await page.getByRole('button', { name: /로그인/ }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    // API 계약: 대시보드 통계 응답 형식
    const { accessToken } = await apiLogin(request, TENANT_EMAIL, TENANT_PASSWORD, TENANT_SLUG)
    const stats = await request.get(`${BACKEND_URL}/api/v1/dashboard/stats`, {
      headers: authHeader(accessToken),
    })
    expect(stats.ok()).toBeTruthy()
    const body = await stats.json()
    expect(body.data).toHaveProperty('pending_inquiries')
  })

  // 3. 섹션 편집 → 저장 → 홈페이지 반영
  test('시나리오 3: 섹션을 수정하면 홈페이지에 반영된다', async ({ page, request }) => {
    const { accessToken } = await apiLogin(request, TENANT_EMAIL, TENANT_PASSWORD, TENANT_SLUG)
    const list = await request.get(`${BACKEND_URL}/api/v1/sections`, {
      headers: authHeader(accessToken),
    })
    const sections = (await list.json()).data
    expect(sections.length).toBeGreaterThan(0)
    const section = sections[0]
    const newTitle = `E2E 반영 ${Date.now()}`

    const patch = await request.patch(`${BACKEND_URL}/api/v1/sections/${section.id}`, {
      headers: authHeader(accessToken),
      data: { main_title: newTitle },
    })
    expect(patch.ok()).toBeTruthy()

    // 홈페이지 SSR 반영 확인
    await page.goto(`/${TENANT_SLUG}`)
    await expect(page.getByText(newTitle)).toBeVisible()
  })

  // 4. 문의 제출 → 알림 → 관리자 처리
  test('시나리오 4: 방문자 문의 제출 후 관리자가 처리한다', async ({ request }) => {
    // 공개 문의 제출
    const submit = await request.post(`${BACKEND_URL}/api/public/inquiries/submit`, {
      data: {
        tenant_slug: TENANT_SLUG,
        inquiry_type: 'GENERAL',
        name: 'E2E 방문자',
        phone: '010-1234-5678',
        content: 'E2E 통합 시나리오 문의입니다.',
      },
    })
    expect(submit.status()).toBe(201)

    // 관리자 조회 → 처리(상태 변경)
    const { accessToken } = await apiLogin(request, TENANT_EMAIL, TENANT_PASSWORD, TENANT_SLUG)
    const listed = await request.get(`${BACKEND_URL}/api/v1/inquiries`, {
      headers: authHeader(accessToken),
    })
    const inquiries = (await listed.json()).data
    expect(inquiries.length).toBeGreaterThan(0)

    const patched = await request.patch(`${BACKEND_URL}/api/v1/inquiries/${inquiries[0].id}`, {
      headers: authHeader(accessToken),
      data: { status: 'DONE' },
    })
    expect(patched.ok()).toBeTruthy()
  })

  // 5. 템플릿 변경 → 콘텐츠 유지
  test('시나리오 5: 템플릿을 변경해도 섹션 콘텐츠가 유지된다', async ({ request }) => {
    const { accessToken } = await apiLogin(request, TENANT_EMAIL, TENANT_PASSWORD, TENANT_SLUG)
    const before = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/sections`, {
          headers: authHeader(accessToken),
        })
      ).json()
    ).data
    const beforeCount = before.length

    const templates = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/templates`, {
          headers: authHeader(accessToken),
        })
      ).json()
    ).data
    const target = templates.find((t: { is_active?: boolean }) => t) ?? templates[0]

    const apply = await request.post(`${BACKEND_URL}/api/v1/templates/${target.id}/apply`, {
      headers: authHeader(accessToken),
    })
    expect(apply.ok()).toBeTruthy()

    // 섹션 콘텐츠(개수) 유지
    const after = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/sections`, {
          headers: authHeader(accessToken),
        })
      ).json()
    ).data
    expect(after.length).toBe(beforeCount)
  })

  // 6. 인라인 편집 → AI 추천 → 저장
  test('시나리오 6: 인라인 편집에서 AI 문구 추천을 받아 저장한다', async ({ request }) => {
    const { accessToken } = await apiLogin(request, TENANT_EMAIL, TENANT_PASSWORD, TENANT_SLUG)
    // AI 문구 추천
    const suggest = await request.post(`${BACKEND_URL}/api/v1/ai/copy-suggest`, {
      headers: authHeader(accessToken),
      data: { field_type: 'main_title', tone: 'FRIENDLY', context: '통증의학과' },
    })
    expect(suggest.ok()).toBeTruthy()
    const suggestions = (await suggest.json()).data
    expect(suggestions).toBeTruthy()

    // 추천 문구로 배치 저장
    const save = await request.post(`${BACKEND_URL}/api/v1/edit/batch-save`, {
      headers: authHeader(accessToken),
      data: { changes: [{ field: 'main_title', value: 'AI 추천 제목' }] },
    })
    expect(save.ok()).toBeTruthy()
  })

  // 슈퍼 어드민 앱 접근 (system 서브도메인 라우팅 스모크)
  test('슈퍼 어드민 앱 로그인 화면이 노출된다', async ({ page }) => {
    await page.goto(`${SYSTEM_URL}/login`)
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible()
  })
})
