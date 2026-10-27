import { expect, test } from '@playwright/test'
import {
  ADMIN_URL,
  BACKEND_URL,
  CLIENT_URL,
  FULL_STACK,
  SYSTEM_URL,
  TEST_TENANT_ADMIN,
  apiLogin,
  authHeader,
  findSection,
  saveFields,
  settingValue,
  superLogin,
} from './helpers'

// ─────────────────────────────────────────────────────────────────────────
// T-078 전체 통합 시나리오 (E2E) — T-078-A 에서 실제 API 계약에 맞춰 다시 씀.
// 크로스 앱(슈퍼 어드민 → 관리자 → 홈페이지) + 백엔드를 실제로 관통한다.
// 전제: 백엔드 · 시드 · 프론트 3개 (홈 3000 · 관리자 3001 · 슈퍼 3002)
//   E2E_FULL_STACK=1 E2E_SUPER_PASSWORD=<시드 SUPER_ADMIN_PASSWORD> pnpm test:e2e
// 바꾼 값은 끝나면 되돌린다. 새로 만든 테넌트는 비활성화한다.
// ─────────────────────────────────────────────────────────────────────────

const { email, password, slug } = TEST_TENANT_ADMIN

test.describe.configure({ mode: 'serial' })

test.describe('T-078 전체 통합 시나리오', () => {
  test.skip(!FULL_STACK, '전체 스택(백엔드+시드, 3개 프론트) 기동 후 E2E_FULL_STACK=1로 활성화')

  let token: string

  test.beforeAll(async ({ request }) => {
    if (!FULL_STACK) return
    token = (await apiLogin(request, email, password, slug)).accessToken
  })

  test('시나리오 1: 슈퍼 어드민이 새 사업체를 만들면 그 관리자가 로그인할 수 있다', async ({
    request,
  }) => {
    const superToken = await superLogin(request)
    const newSlug = `e2e-${Date.now()}`
    const adminEmail = `${newSlug}@example.com`

    const res = await request.post(`${BACKEND_URL}/api/super/v1/tenants`, {
      headers: authHeader(superToken),
      data: {
        slug: newSlug,
        name: 'E2E 신규 사업체',
        template_type: 'GENERAL',
        plan_type: 'BASIC',
        admin_email: adminEmail,
        admin_password: 'e2e-password-1234',
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const tenant = (await res.json()).data.tenant
    expect(tenant.slug).toBe(newSlug)

    // 만든 관리자 계정으로 실제 로그인 · 자기 섹션 조회
    const created = await apiLogin(request, adminEmail, 'e2e-password-1234', newSlug)
    const sections = await request.get(`${BACKEND_URL}/api/v1/sections`, {
      headers: authHeader(created.accessToken),
    })
    expect(sections.ok()).toBeTruthy()

    // 정리 — 테스트 사업체는 비활성화
    const off = await request.patch(`${BACKEND_URL}/api/super/v1/tenants/${tenant.id}`, {
      headers: authHeader(superToken),
      data: { is_active: false },
    })
    expect(off.ok(), await off.text()).toBeTruthy()
  })

  test('시나리오 2: 관리자 앱에 로그인하면 대시보드가 열리고 통계를 받는다', async ({
    page,
    request,
  }) => {
    await page.goto(`${ADMIN_URL}/login`)
    await page.getByLabel('이메일').fill(email)
    await page.getByLabel('비밀번호').fill(password)
    await page.getByLabel('사이트 슬러그').fill(slug)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/\/admin\/dashboard/)

    const stats = await request.get(`${BACKEND_URL}/api/v1/dashboard/stats`, {
      headers: authHeader(token),
    })
    expect(stats.ok()).toBeTruthy()
    const data = (await stats.json()).data
    expect(data).toHaveProperty('pending_inquiries')
    expect(data).toHaveProperty('today_page_views')
  })

  test('시나리오 3: 관리자 화면에서 섹션을 저장하면 홈페이지에 바로 반영된다', async ({
    page,
    request,
  }) => {
    const hero = await findSection(request, token, 'HERO_BANNER')
    const original = settingValue(hero, 'main_title')
    const newTitle = `E2E 반영 ${Date.now() % 100000}`
    try {
      // 관리자 폼 저장과 같은 API (PATCH /sections/{id})
      const patch = await request.patch(`${BACKEND_URL}/api/v1/sections/${hero.id}`, {
        headers: authHeader(token),
        data: { settings: [{ field_key: 'main_title', field_value: newTitle }] },
      })
      expect(patch.ok(), await patch.text()).toBeTruthy()

      await page.goto(`/${slug}`)
      await expect(page.locator(`[data-section-id="${hero.id}"][data-field="main_title"]`)).toHaveText(
        newTitle,
      )
    } finally {
      await saveFields(request, token, hero.id, { main_title: original })
    }
  })

  test('시나리오 4: 방문자 문의를 관리자가 확인하고 처리한다', async ({ request }) => {
    const visitor = `E2E 방문자 ${Date.now() % 100000}`
    const submit = await request.post(`${BACKEND_URL}/api/public/inquiries`, {
      params: { tenant_slug: slug },
      data: {
        name: visitor,
        phone: '010-1234-5678',
        message: 'E2E 통합 시나리오 문의입니다. 처리 흐름을 확인합니다.',
      },
    })
    expect(submit.ok(), await submit.text()).toBeTruthy()
    const inquiryId = (await submit.json()).data.inquiry_id

    const listed = await request.get(`${BACKEND_URL}/api/v1/inquiries`, {
      headers: authHeader(token),
    })
    const items = (await listed.json()).data.items as Array<{ id: string; name: string }>
    expect(items.find((i) => i.id === inquiryId)?.name).toBe(visitor)

    const patched = await request.patch(`${BACKEND_URL}/api/v1/inquiries/${inquiryId}`, {
      headers: authHeader(token),
      data: { status: 'DONE', admin_memo: 'E2E 처리 완료' },
    })
    expect(patched.ok()).toBeTruthy()
    const detail = await request.get(`${BACKEND_URL}/api/v1/inquiries/${inquiryId}`, {
      headers: authHeader(token),
    })
    expect((await detail.json()).data.status).toBe('DONE')
  })

  test('시나리오 5: 템플릿을 바꿔도 내 콘텐츠는 그대로다 (콘텐츠 유지 모드)', async ({
    request,
  }) => {
    const hero = await findSection(request, token, 'HERO_BANNER')
    const titleBefore = settingValue(hero, 'main_title')

    const listRes = await request.get(`${BACKEND_URL}/api/v1/templates`, {
      headers: authHeader(token),
    })
    const { templates, current_template_id } = (await listRes.json()).data as {
      templates: Array<{ id: string; locked: boolean }>
      current_template_id: string | null
    }
    const target = templates.find((t) => !t.locked && t.id !== current_template_id)
    expect(target, '바꿀 수 있는 템플릿이 없음 — 시드 확인').toBeTruthy()

    const apply = await request.post(`${BACKEND_URL}/api/v1/templates/apply`, {
      headers: authHeader(token),
      data: { template_id: target!.id, content_mode: 'keep' },
    })
    expect(apply.ok(), await apply.text()).toBeTruthy()
    try {
      const after = await findSection(request, token, 'HERO_BANNER')
      expect(settingValue(after, 'main_title')).toBe(titleBefore)
    } finally {
      // 원래 템플릿으로 되돌린다
      await request.post(`${BACKEND_URL}/api/v1/templates/rollback`, {
        headers: authHeader(token),
      })
    }
  })

  test('시나리오 6: AI 문구 추천 — 키가 없거나 장애면 안내 메시지(502), 있으면 추천', async ({
    request,
  }) => {
    const res = await request.post(`${BACKEND_URL}/api/v1/ai/suggest-copy`, {
      headers: authHeader(token),
      data: { section_type: 'HERO_BANNER', field: 'main_title', count: 2 },
    })
    if (process.env.E2E_OPENAI === '1') {
      expect(res.ok(), await res.text()).toBeTruthy()
      expect((await res.json()).data.suggestions.length).toBeGreaterThan(0)
    } else {
      // CI 에는 실제 키가 없다 — 500 이 아니라 사용자 안내로 끝나야 한다
      expect(res.status()).toBe(502)
      expect((await res.json()).error.message).toContain('AI 문구 생성에 실패했습니다')
    }
  })

  test('시나리오 7: 관리자 화면에서 섹션을 추가하면 홈페이지에 나타나고, 삭제하면 사라진다 (T-037-A)', async ({
    page,
  }) => {
    const label = `E2E 섹션 ${Date.now() % 100000}`
    await page.goto(`${ADMIN_URL}/login`)
    await page.getByLabel('이메일').fill(email)
    await page.getByLabel('비밀번호').fill(password)
    await page.getByLabel('사이트 슬러그').fill(slug)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/\/admin\/dashboard/)

    await page.goto(`${ADMIN_URL}/admin/content`)
    await page.getByRole('button', { name: '섹션 추가' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('소개').check()
    await dialog.getByLabel('섹션 이름 (선택)').fill(label)
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/v1/sections') && r.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: '추가' }).click()
    const sectionId = (await (await created).json()).data.id as string
    await expect(page.getByText(label)).toBeVisible()

    // 방문자 홈페이지 — 시작 문구가 든 새 섹션
    const visitor = await page.context().browser()!.newPage()
    await visitor.goto(`${CLIENT_URL}/${slug}`)
    await expect(visitor.locator(`[data-section-id="${sectionId}"]`).first()).toBeVisible()

    // 삭제 → 홈페이지에서 사라진다
    await page.getByRole('button', { name: `${label} 삭제` }).click()
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
    await expect(page.getByText(label)).toHaveCount(0)
    await visitor.reload()
    await expect(visitor.locator(`[data-section-id="${sectionId}"]`)).toHaveCount(0)
    await visitor.close()
  })

  test('슈퍼 어드민 앱 로그인 화면이 열린다', async ({ page }) => {
    await page.goto(`${SYSTEM_URL}/login`)
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible()
  })
})
