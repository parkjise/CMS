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

  test('시나리오 13: 하스피털 A 로 바꾸면 곧바로 그 화면이 나오고, 편집 모드로 글을 고칠 수 있다 (T-125-A)', async ({
    page,
    request,
  }) => {
    const headers = authHeader(token)
    const list = (await (await request.get(`${BACKEND_URL}/api/v1/templates`, { headers })).json())
      .data as { templates: Array<{ id: string; locked: boolean; renderer?: string }> }
    const code = list.templates.find((t) => t.renderer === 'code' && !t.locked)
    expect(code, '코드형 템플릿이 필요 — 시드 확인').toBeTruthy()

    const applied = await request.post(`${BACKEND_URL}/api/v1/templates/apply`, {
      headers,
      data: { template_id: code!.id, content_mode: 'replace_with_sample' },
    })
    expect(applied.ok(), await applied.text()).toBeTruthy()
    try {
      // 템플릿 확인 캐시가 짧아 몇 초 안에 새 템플릿 화면 (예전엔 최대 60초 · 그동안 404)
      await expect
        .poll(
          async () => {
            await page.goto(`${CLIENT_URL}/${slug}`)
            return page.locator('aside.quick-menu').count()
          },
          { timeout: 15_000, intervals: [1_000] },
        )
        .toBeGreaterThan(0)

      // 홈페이지 로그인 → 왼쪽 아래 '편집 모드' → 글 고치기 → 저장
      await page.goto(`${CLIENT_URL}/${slug}/login`)
      await page.locator('#login-email').fill(email)
      await page.locator('#login-password').fill(password)
      await page.locator('form button[type="submit"]').click()
      await page.waitForURL((url) => !url.pathname.endsWith('/login'))
      await page.goto(`${CLIENT_URL}/${slug}`)
      await page.getByRole('button', { name: '편집 모드' }).click()
      await expect(page.getByRole('toolbar', { name: '편집 모드 툴바' })).toBeVisible()

      const target = page.locator('[data-editable="text"]').first()
      const sectionId = await target.getAttribute('data-section-id')
      const field = await target.getAttribute('data-field')
      const text = `코드형 편집 ${Date.now() % 100000}`
      await target.click()
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.type(text)
      // 여러 줄 칸도 있어 Enter 대신 포커스를 빼서 반영
      await target.evaluate((el) => (el as HTMLElement).blur())
      const saved = page.waitForResponse((r) => r.url().includes('/edit/batch-save'))
      await page.getByRole('button', { name: /^저장 \(/ }).click()
      expect((await (await saved).json()).data.saved_count).toBeGreaterThan(0)

      const visitor = await page.context().browser()!.newPage()
      await visitor.goto(`${CLIENT_URL}/${slug}`)
      await expect(
        visitor.locator(`[data-section-id="${sectionId}"][data-field="${field}"]`),
      ).toHaveText(text)
      await visitor.close()
    } finally {
      const rb = await request.post(`${BACKEND_URL}/api/v1/templates/rollback`, { headers })
      expect(rb.ok(), await rb.text()).toBeTruthy()
      await page.evaluate(() => localStorage.removeItem('cms-edit-draft')).catch(() => {})
    }
    // 되돌리면 몇 초 안에 원래(테마형) 화면 — 404 가 아니다
    await expect
      .poll(
        async () => {
          const res = await page.goto(`${CLIENT_URL}/${slug}`)
          return (await page.locator('section[data-section-type="HERO_BANNER"]').count()) > 0 && res?.ok()
        },
        { timeout: 15_000, intervals: [1_000] },
      )
      .toBeTruthy()
  })

  test('시나리오 14: 관리자에서 버튼을 테두리 스타일 · 새 창으로 저장하면 홈페이지 버튼에 반영 (T-088-A)', async ({
    page,
    request,
  }) => {
    const hero = await findSection(request, token, 'HERO_BANNER')
    const keys = ['cta_text', 'cta_url', 'cta_style', 'cta_new_tab'] as const
    const original = Object.fromEntries(keys.map((k) => [k, settingValue(hero, k) ?? null]))
    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/content/${hero.id}`)
      await page.getByPlaceholder('문의하기').fill('예약하기')
      await page.getByPlaceholder('https://...').last().fill('https://booking.example.com')
      await page.getByLabel('버튼 스타일').selectOption('outline')
      await page.getByLabel('버튼을 누르면 새 탭에서 열기').check()
      const saved = page.waitForResponse(
        (r) => r.url().includes(`/v1/sections/${hero.id}`) && r.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: '변경사항 저장' }).click()
      expect((await saved).ok()).toBeTruthy()

      await page.goto(`${CLIENT_URL}/${slug}`)
      const button = page.getByRole('link', { name: '예약하기' })
      await expect(button).toHaveAttribute('data-button-style', 'outline')
      await expect(button).toHaveAttribute('target', '_blank')
      await expect(button).toHaveAttribute('rel', /noopener/)
    } finally {
      await saveFields(request, token, hero.id, original)
    }
  })

  test('시나리오 15: 관리자 템플릿 화면에서 AI 추천 3개를 보고 바로 적용한다 (T-070-A)', async ({
    page,
    request,
  }) => {
    await page.goto(`${ADMIN_URL}/login`)
    await page.getByLabel('이메일').fill(email)
    await page.getByLabel('비밀번호').fill(password)
    await page.getByLabel('사이트 슬러그').fill(slug)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/\/admin\/dashboard/)

    await page.goto(`${ADMIN_URL}/admin/templates`)
    const card = page.getByRole('region', { name: 'AI 템플릿 추천' })
    // CI 에는 AI 키가 없어 업종 기준 기본 추천 — 그래도 3개가 이유와 함께 나온다
    await expect(card.getByRole('listitem')).toHaveCount(3)
    await expect(card.getByText('기본 추천 (업종 기준)')).toBeVisible()

    const name = (await card.getByRole('listitem').first().locator('p').first().textContent())!
      .replace(/^1\.\s*/, '')
      .trim()
    await card.getByRole('listitem').first().getByRole('button', { name: '적용' }).click()
    const applied = page.waitForResponse((r) => r.url().includes('/v1/templates/apply'))
    await page.getByRole('dialog').getByRole('button', { name: /적용/ }).last().click()
    expect((await applied).ok()).toBeTruthy()
    await expect(page.getByText(`'${name}' 템플릿을 적용했습니다`, { exact: false })).toBeVisible()

    // 원래 템플릿으로 되돌린다
    const rb = await request.post(`${BACKEND_URL}/api/v1/templates/rollback`, {
      headers: authHeader(token),
    })
    expect(rb.ok(), await rb.text()).toBeTruthy()
  })

  test('시나리오 16: 관리자 월간 리포트에서 지금 분석하기 → 손볼 점의 링크로 고치러 간다 (T-073-A)', async ({
    page,
  }) => {
    await page.goto(`${ADMIN_URL}/login`)
    await page.getByLabel('이메일').fill(email)
    await page.getByLabel('비밀번호').fill(password)
    await page.getByLabel('사이트 슬러그').fill(slug)
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/\/admin\/dashboard/)

    await page.getByRole('link', { name: '월간 리포트' }).click()
    await expect(page.getByRole('heading', { name: '월간 리포트' })).toBeVisible()

    const analyze = page.getByRole('button', { name: '지금 분석하기' })
    await expect(page.getByText(/이번 달 \d+ \/ \d+회 사용/)).toBeVisible()
    if (await analyze.isEnabled()) {
      const created = page.waitForResponse(
        (r) => r.url().endsWith('/v1/ai/reports') && r.request().method() === 'POST',
      )
      await analyze.click()
      expect((await created).ok()).toBeTruthy()
      // 이번 달 횟수를 다 쓰면 더 못 만든다 (STANDARD 월 1회)
    }
    const report = page.getByRole('article')
    await expect(report.getByRole('heading', { name: '손보면 좋은 점' })).toBeVisible()
    // CI 에는 AI 키가 없어 기본 점검 — 방문자 0명이라 검색 등록 안내가 반드시 나온다
    await expect(report.getByText('기본 점검')).toBeVisible()
    const fix = report.getByRole('link', { name: /고치러 가기|으로|보기/ }).first()
    await fix.click()
    await expect(page).toHaveURL(/\/admin\/(content|seo)/)
  })

  test('시나리오 17: 관리자 SEO 화면에서 대표 키워드를 저장하면 홈페이지 JSON-LD 에 들어간다 (T-040-A)', async ({
    page,
    request,
  }) => {
    const seoUrl = `${BACKEND_URL}/api/v1/seo-settings`
    const before = await request.get(seoUrl, { headers: authHeader(token) })
    const original: string[] = (await before.json()).data?.keywords ?? []
    const word = `E2E키워드${Date.now() % 10000}`
    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/seo`)
      const input = page.getByLabel('키워드 입력')
      // 테스트 사업체는 STANDARD 이상 — 잠금이 아니어야 한다
      await expect(input).toBeEnabled()
      // 자리를 비워 둔다 (최대 5개)
      for (const kw of original) {
        await page.getByRole('button', { name: `${kw} 삭제` }).click()
      }
      await input.fill(word)
      await input.press('Enter')
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/v1/seo-settings') && r.request().method() === 'PUT',
      )
      await page.getByRole('button', { name: '기본 SEO 저장' }).click()
      expect((await saved).ok()).toBeTruthy()

      // 다시 열어도 남아 있다
      await page.reload()
      await expect(page.getByText(word, { exact: true })).toBeVisible()

      await page.goto(`${CLIENT_URL}/${slug}`)
      const ld = JSON.parse(
        (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
      )
      expect(ld.keywords).toBe(word)
    } finally {
      const rb = await request.put(seoUrl, {
        headers: authHeader(token),
        data: { keywords: original },
      })
      expect(rb.ok(), await rb.text()).toBeTruthy()
    }
  })

  test('시나리오 18: 관리자 공통 설정의 사업체 정보 · 파비콘이 홈페이지 푸터 · 구조화 데이터 · 탭 아이콘에 반영된다 (T-036-A)', async ({
    page,
    request,
  }) => {
    const url = `${BACKEND_URL}/api/v1/site-settings`
    const before = (await (await request.get(url, { headers: authHeader(token) })).json()).data
    const fields = ['phone', 'address', 'ceo', 'business_number', 'favicon_url'] as const
    const original = Object.fromEntries(fields.map((f) => [f, before?.[f] ?? '']))
    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/content`)
      await page.getByRole('button', { name: '공통 설정' }).click()
      await page.getByLabel('대표 전화').fill('02-7777-8888')
      await page.getByLabel('주소', { exact: true }).fill('서울특별시 중구 세종대로 110')
      await page.getByLabel('대표자').fill('E2E대표')
      await page.getByLabel('사업자등록번호').fill('1112233333')
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/v1/site-settings') && r.request().method() === 'PUT',
      )
      await page.getByRole('button', { name: '공통 설정 저장' }).click()
      expect((await saved).ok()).toBeTruthy()
      // 사업자등록번호는 하이픈을 넣어 저장
      await expect(page.getByLabel('사업자등록번호')).toHaveValue('111-22-33333')

      // 파비콘은 업로드 대신 주소로 저장 (업로드는 단위 테스트)
      const fav = await request.put(url, {
        headers: authHeader(token),
        data: { favicon_url: 'https://cdn.example.com/e2e-favicon.webp' },
      })
      expect(fav.ok(), await fav.text()).toBeTruthy()

      await page.goto(`${CLIENT_URL}/${slug}`)
      const footer = page.getByRole('contentinfo')
      await expect(footer).toContainText('02-7777-8888')
      await expect(footer).toContainText('서울특별시 중구 세종대로 110')
      await expect(footer).toContainText('대표자 E2E대표')
      await expect(footer).toContainText('사업자등록번호 111-22-33333')
      const ld = JSON.parse(
        (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
      )
      expect(ld.telephone).toBe('02-7777-8888')
      expect(ld.address.streetAddress).toBe('서울특별시 중구 세종대로 110')
      await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute(
        'href',
        /e2e-favicon\.webp/,
      )
    } finally {
      const rb = await request.put(url, { headers: authHeader(token), data: original })
      expect(rb.ok(), await rb.text()).toBeTruthy()
    }
  })

  test('시나리오 19: 관리자 모바일 설정 — 휴대폰에서 숨긴 섹션은 휴대폰에서만 안 보이고, 메인 배너는 휴대폰용 배경을 쓴다 (T-037-D)', async ({
    page,
    request,
  }) => {
    const intro = await findSection(request, token, 'INTRO')
    const hero = await findSection(request, token, 'HERO_BANNER')
    const patch = (id: string, settings: { field_key: string; field_value: string; value_type: string }[]) =>
      request.patch(`${BACKEND_URL}/api/v1/sections/${id}`, {
        headers: authHeader(token),
        data: { settings },
      })
    const originalMobileImage = settingValue(hero, 'mobile_image_url') ?? ''
    const originalBg = settingValue(hero, 'bg_image_url') ?? ''
    try {
      // 관리자 섹션 편집 → 모바일 설정 탭에서 소개 섹션 숨기기
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)
      await page.goto(`${ADMIN_URL}/admin/content/${intro.id}`)
      await page.getByRole('button', { name: '모바일 설정' }).click()
      await page.getByRole('checkbox', { name: /휴대폰에서 숨기기/ }).check({ force: true })
      const saved = page.waitForResponse(
        (r) => r.url().includes(`/v1/sections/${intro.id}`) && r.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: /저장/ }).click()
      expect((await saved).ok()).toBeTruthy()

      // 메인 배너 휴대폰용 배경 (업로드는 단위 테스트 — 여기선 주소로)
      const img = await patch(hero.id, [
        { field_key: 'bg_image_url', field_value: '/e2e-desktop-bg.webp', value_type: 'URL' },
        { field_key: 'mobile_image_url', field_value: '/e2e-mobile-bg.webp', value_type: 'URL' },
      ])
      expect(img.ok(), await img.text()).toBeTruthy()

      // 휴대폰 화면 — 소개가 안 보이고, 배너는 휴대폰용 배경
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${CLIENT_URL}/${slug}`)
      await expect(page.locator(`[data-section-wrapper="${intro.id}"]`)).toBeHidden()
      const heroEl = page.locator(`section[data-section-id="${hero.id}"]`)
      await expect
        .poll(() => heroEl.evaluate((el) => getComputedStyle(el).backgroundImage))
        .toContain('e2e-mobile-bg.webp')

      // PC 화면 — 소개가 보이고, 배너는 원래 배경
      await page.setViewportSize({ width: 1280, height: 900 })
      await expect(page.locator(`[data-section-wrapper="${intro.id}"]`)).toBeVisible()
      await expect
        .poll(() => heroEl.evaluate((el) => getComputedStyle(el).backgroundImage))
        .toContain('e2e-desktop-bg.webp')
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 })
      const r1 = await patch(intro.id, [{ field_key: 'mobile_hidden', field_value: 'false', value_type: 'BOOLEAN' }])
      const r2 = await patch(hero.id, [
        { field_key: 'bg_image_url', field_value: originalBg, value_type: 'URL' },
        { field_key: 'mobile_image_url', field_value: originalMobileImage, value_type: 'URL' },
      ])
      expect(r1.ok() && r2.ok()).toBeTruthy()
    }
  })

  test('시나리오 20: 관리자 공통 설정의 상단 메뉴 이름 · 숨기기가 홈페이지 메뉴에 반영된다 (T-036-B)', async ({
    page,
    request,
  }) => {
    const url = `${BACKEND_URL}/api/v1/site-settings/menu`
    const menu = (await (await request.get(url, { headers: authHeader(token) })).json()).data
    expect(menu.items.length, '메뉴로 보일 섹션이 2개 이상이어야 한다').toBeGreaterThanOrEqual(2)
    const [first, second] = menu.items as { key: string; default_label: string }[]
    try {
      await page.goto(`${ADMIN_URL}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByLabel('사이트 슬러그').fill(slug)
      await page.getByRole('button', { name: '로그인' }).click()
      await expect(page).toHaveURL(/\/admin\/dashboard/)

      await page.goto(`${ADMIN_URL}/admin/content`)
      await page.getByRole('button', { name: '공통 설정' }).click()
      await page.getByLabel(`${first.default_label} 메뉴 이름`).fill('E2E 메뉴')
      await page.getByLabel(`${second.default_label} 메뉴 보이기`).uncheck()
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/v1/site-settings/menu') && r.request().method() === 'PUT',
      )
      await page.getByRole('button', { name: '메뉴 저장' }).click()
      expect((await saved).ok()).toBeTruthy()

      await page.goto(`${CLIENT_URL}/${slug}`)
      const nav = page.locator('header nav').first()
      await expect(nav.getByText('E2E 메뉴', { exact: true })).toBeVisible()
      await expect(nav.getByText(first.default_label, { exact: true })).toHaveCount(0)
      await expect(nav.getByText(second.default_label, { exact: true })).toHaveCount(0)
    } finally {
      const rb = await request.put(url, { headers: authHeader(token), data: { items: [] } })
      expect(rb.ok(), await rb.text()).toBeTruthy()
    }
  })

  test('슈퍼 어드민 앱 로그인 화면이 열린다', async ({ page }) => {
    await page.goto(`${SYSTEM_URL}/login`)
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible()
  })
})
