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
      templates: Array<{ id: string; locked: boolean; renderer?: string }>
      current_template_id: string | null
    }
    // 테마형끼리만 바꾼다 — 코드형으로 남으면 뒤 시나리오(섹션 추가 등)가 깨진다
    const themes = templates.filter((t) => !t.locked && (t.renderer ?? 'theme') === 'theme')
    const apply = (templateId: string) =>
      request.post(`${BACKEND_URL}/api/v1/templates/apply`, {
        headers: authHeader(token),
        data: { template_id: templateId, content_mode: 'keep' },
      })

    // 처음 적용이면 되돌릴 이력이 없다 — 테마형 하나를 먼저 적용해 기준을 만든다
    let base = current_template_id
    if (!base || !themes.some((t) => t.id === base)) {
      base = themes[0]?.id ?? null
      expect(base, '적용할 수 있는 테마형 템플릿이 없음 — 시드 확인').toBeTruthy()
      const first = await apply(base!)
      expect(first.ok(), await first.text()).toBeTruthy()
    }
    const target = themes.find((t) => t.id !== base)
    expect(target, '바꿀 수 있는 템플릿이 없음 — 시드 확인').toBeTruthy()

    const applied = await apply(target!.id)
    expect(applied.ok(), await applied.text()).toBeTruthy()
    try {
      const after = await findSection(request, token, 'HERO_BANNER')
      expect(settingValue(after, 'main_title')).toBe(titleBefore)
    } finally {
      // 원래 템플릿으로 되돌린다 — 실패하면 뒤 시나리오가 다른 템플릿에서 돌게 되므로 확인
      const rollback = await request.post(`${BACKEND_URL}/api/v1/templates/rollback`, {
        headers: authHeader(token),
      })
      expect(rollback.ok(), await rollback.text()).toBeTruthy()
    }
    const restored = await request.get(`${BACKEND_URL}/api/v1/templates`, {
      headers: authHeader(token),
    })
    expect((await restored.json()).data.current_template_id).toBe(base)
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
    // 목록의 그 섹션 줄로 확인 — 성공 토스트에도 같은 이름이 들어 있어 getByText 는 두 개를 찾는다
    const row = page.getByRole('button', { name: `${label} 삭제` })
    await expect(row).toBeVisible()

    // 방문자 홈페이지 — 시작 문구가 든 새 섹션
    const visitor = await page.context().browser()!.newPage()
    await visitor.goto(`${CLIENT_URL}/${slug}`)
    await expect(visitor.locator(`[data-section-id="${sectionId}"]`).first()).toBeVisible()

    // 삭제 → 홈페이지에서 사라진다
    await row.click()
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
    await expect(row).toHaveCount(0)
    await visitor.reload()
    await expect(visitor.locator(`[data-section-id="${sectionId}"]`)).toHaveCount(0)
    await visitor.close()
  })

  test('시나리오 8: 관리자 화면에서 배경 이미지를 올려 저장하면 홈페이지에 바뀐 이미지가 보인다 (T-037-B)', async ({
    page,
    request,
  }) => {
    const hero = await findSection(request, token, 'HERO_BANNER')
    const original = settingValue(hero, 'bg_image_url') ?? null
    // 1x1 PNG — 서버가 WebP 로 최적화해 저장소에 올린다
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64',
    )
    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/content/${hero.id}`)
      const uploaded = page.waitForResponse((r) => r.url().includes('/v1/upload/image'))
      await page.getByTestId('hero-file-input').setInputFiles({
        name: 'banner.png',
        mimeType: 'image/png',
        buffer: png,
      })
      const url = (await (await uploaded).json()).data.url as string
      expect(url).toMatch(/\.webp$/)
      await expect(page.getByText(/로 최적화되었습니다\./).first()).toBeVisible()

      const saved = page.waitForResponse(
        (r) => r.url().includes(`/v1/sections/${hero.id}`) && r.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: '변경사항 저장' }).click()
      expect((await saved).ok()).toBeTruthy()

      // 방문자 홈페이지 — 배경에 새 이미지
      await page.goto(`${CLIENT_URL}/${slug}`)
      await expect(page.locator(`section[data-section-id="${hero.id}"]`)).toHaveAttribute(
        'style',
        new RegExp(url.split('/').pop()!.replace('.', '\\.')),
      )
    } finally {
      await saveFields(request, token, hero.id, { bg_image_url: original })
    }
  })

  test('시나리오 9: 관리자 SNS 노출 위치를 바꾸면 홈페이지 푸터 · 카카오톡 버튼에 반영된다 (T-038-A)', async ({
    page,
    request,
  }) => {
    const before = (
      await (
        await request.get(`${BACKEND_URL}/api/v1/sns-settings`, { headers: authHeader(token) })
      ).json()
    ).data as Record<string, unknown> | null
    const put = (data: Record<string, unknown>) =>
      request.put(`${BACKEND_URL}/api/v1/sns-settings`, { headers: authHeader(token), data })

    try {
      const seeded = await put({
        kakao_url: 'https://pf.kakao.com/_e2e',
        instagram_url: 'https://instagram.com/e2e',
        show_in_footer: true,
        show_floating: true,
        floating_position: 'BOTTOM_RIGHT',
      })
      expect(seeded.ok(), await seeded.text()).toBeTruthy()

      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/sns`)
      await page.getByLabel('푸터(Footer)에 SNS 아이콘 노출').uncheck()
      await page.getByLabel('플로팅 버튼 위치').selectOption('BOTTOM_LEFT')
      const saved = page.waitForResponse(
        (r) => r.url().includes('/v1/sns-settings') && r.request().method() === 'PUT',
      )
      await page.getByRole('button', { name: /저장/ }).first().click()
      expect((await saved).ok()).toBeTruthy()

      await page.goto(`${CLIENT_URL}/${slug}`)
      await expect(page.getByRole('contentinfo').getByRole('link', { name: '인스타그램' })).toHaveCount(0)
      await expect(
        page.getByTestId('kakao-left').getByRole('link', { name: '카카오톡 채널' }),
      ).toBeVisible()
    } finally {
      const keys = ['kakao_url', 'instagram_url', 'show_in_footer', 'show_floating', 'floating_position']
      const restore = Object.fromEntries(
        keys.map((k) => [k, before?.[k] ?? (k.endsWith('_url') ? '' : k === 'floating_position' ? 'BOTTOM_RIGHT' : true)]),
      )
      await put(restore)
    }
  })

  test('시나리오 10: 관리자 SEO 화면에서 공유 이미지를 올려 저장하면 홈페이지 og:image 에 반영된다 (T-037-C)', async ({
    page,
    request,
  }) => {
    const seoRes = await request.get(`${BACKEND_URL}/api/v1/seo-settings`, {
      headers: authHeader(token),
    })
    const original = ((await seoRes.json()).data?.og_image_url as string | null) ?? null
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64',
    )
    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/seo`)
      await page.getByRole('button', { name: '소셜 미리보기' }).click()
      const uploaded = page.waitForResponse((r) => r.url().includes('/v1/upload/image'))
      await page.getByTestId('seo-file-input').setInputFiles({
        name: 'og.png',
        mimeType: 'image/png',
        buffer: png,
      })
      const url = (await (await uploaded).json()).data.url as string
      expect(url).toContain('/seo/')

      const saved = page.waitForResponse(
        (r) => r.url().includes('/v1/seo-settings') && r.request().method() === 'PUT',
      )
      await page.getByRole('button', { name: 'OG 이미지 저장' }).click()
      expect((await saved).ok()).toBeTruthy()

      // 방문자 홈페이지 HTML — 소셜 공유 메타
      const html = await (await request.get(`${CLIENT_URL}/${slug}`)).text()
      expect(html).toMatch(new RegExp(`property="og:image" content="[^"]*${url.split('/').pop()}`))
    } finally {
      await request.put(`${BACKEND_URL}/api/v1/seo-settings`, {
        headers: authHeader(token),
        data: { og_image_url: original },
      })
    }
  })

  test('시나리오 11: 코드형 템플릿용 내용으로 테마형 템플릿을 미리봐도 메뉴가 넘치지 않고 안내가 뜬다 (T-057-A)', async ({
    page,
    request,
  }) => {
    const headers = authHeader(token)
    const sectionIds = async () =>
      new Set(
        ((await (await request.get(`${BACKEND_URL}/api/v1/sections`, { headers })).json())
          .data as Array<{ id: string }>).map((s) => s.id),
      )
    const list = (await (await request.get(`${BACKEND_URL}/api/v1/templates`, { headers })).json())
      .data as {
      templates: Array<{ id: string; locked: boolean; renderer?: string; code?: string | null }>
      current_template_id: string | null
    }
    const code = list.templates.find((t) => t.renderer === 'code' && !t.locked)
    const theme = list.templates.find((t) => t.renderer !== 'code' && !t.locked)
    expect(code && theme, '코드형 · 테마형 템플릿이 필요 — 시드 확인').toBeTruthy()

    const before = await sectionIds()
    // 코드형 적용(내용 유지) — 그 템플릿에만 있는 섹션(메인 슬라이드 · 하위 페이지)이 샘플로 추가된다
    const applied = await request.post(`${BACKEND_URL}/api/v1/templates/apply`, {
      headers,
      data: { template_id: code!.id, content_mode: 'keep' },
    })
    expect(applied.ok(), await applied.text()).toBeTruthy()
    const added = [...(await sectionIds())].filter((id) => !before.has(id))
    try {
      expect(added.length).toBeGreaterThan(0)
      await page.goto(`${CLIENT_URL}/${slug}/preview?tpl=${theme!.id}`)
      await expect(page.getByTestId('preview-hidden-notice')).toContainText('이 템플릿에서 보이지 않습니다')
      // 메뉴에는 홈의 그릴 수 있는 섹션만 — 하위 페이지 섹션이 섞이지 않는다
      const menu = page.getByRole('navigation', { name: '페이지 내 섹션' }).getByRole('button')
      const rendered = page.locator('[data-section-wrapper]')
      await expect(menu).toHaveCount(await rendered.count())
      expect(await menu.count()).toBeLessThan(added.length + before.size)
    } finally {
      // 원래 템플릿으로 되돌리고, 적용하며 추가된 섹션을 지운다
      const rollback = await request.post(`${BACKEND_URL}/api/v1/templates/rollback`, { headers })
      expect(rollback.ok(), await rollback.text()).toBeTruthy()
      for (const id of added) {
        await request.delete(`${BACKEND_URL}/api/v1/sections/${id}`, { headers })
      }
    }
    expect([...(await sectionIds())].sort()).toEqual([...before].sort())
  })

  test('시나리오 12: 코드형 내용에서 테마형 템플릿으로 바꿔도 홈이 비지 않고, 되돌리면 원래대로 (T-055-A)', async ({
    page,
    request,
  }) => {
    const headers = authHeader(token)
    const homeIds = async () =>
      (
        (await (await request.get(`${BACKEND_URL}/api/v1/sections`, { headers })).json())
          .data as Array<{ id: string; page_key?: string }>
      )
        .filter((s) => (s.page_key ?? 'home') === 'home')
        .map((s) => s.id)
        .sort()
    const list = (await (await request.get(`${BACKEND_URL}/api/v1/templates`, { headers })).json())
      .data as {
      templates: Array<{ id: string; locked: boolean; renderer?: string; section_layouts: string[] }>
    }
    const code = list.templates.find((t) => t.renderer === 'code' && !t.locked)
    const theme = list.templates.find(
      (t) => t.renderer !== 'code' && !t.locked && t.section_layouts.includes('HERO_BANNER'),
    )
    expect(code && theme, '코드형 · 테마형 템플릿이 필요 — 시드 확인').toBeTruthy()
    const before = await homeIds()
    const apply = (id: string, mode: string) =>
      request.post(`${BACKEND_URL}/api/v1/templates/apply`, {
        headers,
        data: { template_id: id, content_mode: mode },
      })
    const rollback = () => request.post(`${BACKEND_URL}/api/v1/templates/rollback`, { headers })

    // 사장님 상황 재현: 코드형 샘플로 교체 → 테마형(내용 유지)으로 변경
    expect((await apply(code!.id, 'replace_with_sample')).ok()).toBeTruthy()
    let rolledBack = 0
    try {
      const res = await apply(theme!.id, 'keep')
      expect(res.ok(), await res.text()).toBeTruthy()
      expect((await res.json()).data.added_section_count).toBeGreaterThan(0)

      await page.goto(`${CLIENT_URL}/${slug}`)
      // 배너가 시작 문구로 보이고, 메뉴는 그려진 섹션 수와 같다 (빈 화면 · 깨진 메뉴 아님)
      await expect(page.locator('section[data-section-type="HERO_BANNER"] h1')).toBeVisible()
      const menu = page.getByRole('navigation', { name: '페이지 내 섹션' }).getByRole('button')
      await expect(menu).toHaveCount(await page.locator('[data-section-wrapper]').count())
    } finally {
      // 테마형 적용 → 코드형 교체 순서로 되돌리면 처음 상태
      for (let i = 0; i < 2; i += 1) {
        if ((await rollback()).ok()) rolledBack += 1
      }
    }
    expect(rolledBack).toBe(2)
    expect(await homeIds()).toEqual(before)
  })

  test('슈퍼 어드민 앱 로그인 화면이 열린다', async ({ page }) => {
    await page.goto(`${SYSTEM_URL}/login`)
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible()
  })
})
