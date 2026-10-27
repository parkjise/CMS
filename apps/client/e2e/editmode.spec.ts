import { expect, test, type Page } from '@playwright/test'
import {
  apiLogin,
  findSection,
  saveFields,
  settingValue,
  TEST_TENANT_ADMIN,
  type AdminSection,
} from './helpers'

// 인라인 편집 모드 E2E (T-066-A) — 실제 백엔드로 로그인 · 저장 · 업로드한다.
// 전제: 백엔드(:8000) + 시드(scripts/seed.py — test-tenant 의 HERO_BANNER · GALLERY 섹션)
// 로그인 · 저장 응답을 흉내 내지 않는다 — 흉내 내면 "실제 서버에서는 전부 401" 같은 버그를 못 잡는다.
// (저장 실패 시나리오만 서버 오류를 흉내 낸다.) 바꾼 값은 끝나면 API 로 되돌린다.

const { email, password, slug } = TEST_TENANT_ADMIN

// 1x1 PNG — 백엔드가 WebP 로 최적화해 저장소에 올린다
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
)

const DRAFT_DIALOG = '저장되지 않은 편집 초안이 있습니다'

let token: string
let hero: AdminSection
let gallery: AdminSection
// 한 페이지로 한 번만 로그인해 이어서 쓴다 — 로그인은 분당 10회 제한이라
// 테스트마다 로그인하면 연달아 돌릴 때 429 로 깨진다
let page: Page

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request, browser }) => {
  token = (await apiLogin(request, email, password, slug)).accessToken
  hero = await findSection(request, token, 'HERO_BANNER')
  gallery = await findSection(request, token, 'GALLERY')
  page = await browser.newPage()
  await login(page)
})

// 다음 테스트가 깨끗한 상태로 시작하도록 — 편집 모드를 나가고 남은 변경을 버린다
test.afterEach(async () => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.evaluate(() => localStorage.removeItem('cms-edit-draft'))
  await page.goto(`/${slug}`)
})

// 테스트가 바꾼 값을 시작 전 값으로 되돌린다
test.afterAll(async ({ request }) => {
  await saveFields(request, token, hero.id, {
    main_title: settingValue(hero, 'main_title'),
  })
  await saveFields(request, token, gallery.id, {
    gallery_items: settingValue(gallery, 'gallery_items') ?? '[]',
  })
  await page?.close()
})

/** 홈페이지 로그인 페이지로 실제 로그인 (access token + refresh 쿠키) */
async function login(page: Page) {
  await page.goto(`/${slug}/login`)
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.endsWith('/login'))
}

const enterEditMode = async (page: Page) => {
  await page.goto(`/${slug}`)
  await page.getByRole('button', { name: '편집 모드' }).click()
  await expect(page.getByRole('toolbar', { name: '편집 모드 툴바' })).toBeVisible()
}

const heroTitle = (page: Page) =>
  page.locator(`[data-section-id="${hero.id}"][data-field="main_title"]`)

const editHeroTitle = async (page: Page, text: string) => {
  const title = heroTitle(page)
  await title.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

const saveButton = (page: Page) => page.getByRole('button', { name: /^저장 \(/ })

test.describe('인라인 편집 모드 E2E', () => {
  test('로그인은 새로고침해도 유지된다 (refresh 쿠키로 토큰 재발급)', async () => {
    await page.goto(`/${slug}`)
    await expect(page.getByRole('button', { name: '편집 모드' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: '편집 모드' })).toBeVisible()
  })

  test('제목 수정 → 저장 → 방문자 화면에 반영, 편집 중 초안 창은 뜨지 않는다', async ({
    browser,
  }) => {
    const newTitle = `E2E 제목 ${Date.now() % 100000}`
    await enterEditMode(page)

    await editHeroTitle(page, newTitle)
    await expect(saveButton(page)).toHaveAccessibleName('저장 (1개 변경사항)')
    await expect(page.getByRole('dialog', { name: DRAFT_DIALOG })).toHaveCount(0)

    const saved = page.waitForResponse((r) => r.url().includes('/edit/batch-save'))
    await saveButton(page).click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByText('1개 변경사항을 저장했습니다.')).toBeVisible()

    // 로그인하지 않은 방문자 화면 (새 브라우저 컨텍스트)
    const visitor = await browser.newPage()
    await visitor.goto(`/${slug}`)
    await expect(visitor.locator(`[data-field="main_title"]`).first()).toHaveText(newTitle)
    await visitor.close()
  })

  test('갤러리에 사진을 올리고 저장하면 방문자 화면에 보인다', async ({ browser }) => {
    await enterEditMode(page)

    const section = page.locator(`[data-section-id="${gallery.id}"][data-section-type="GALLERY"]`)
    const before = await section.getByRole('listitem').count()
    const uploaded = page.waitForResponse((r) => r.url().includes('/upload/image'))
    await section.getByLabel('갤러리 사진 선택').setInputFiles({
      name: 'e2e.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    })
    expect((await uploaded).status()).toBe(200)
    await expect(section.getByRole('listitem')).toHaveCount(before + 1)
    await section.getByLabel(`사진 ${before + 1} 캡션`).fill('E2E 사진')

    const saved = page.waitForResponse((r) => r.url().includes('/edit/batch-save'))
    await saveButton(page).click()
    expect((await saved).status()).toBe(200)

    const visitor = await browser.newPage()
    await visitor.goto(`/${slug}`)
    await expect(
      visitor.locator('[data-section-type="GALLERY"]').getByAltText('E2E 사진'),
    ).toBeVisible()
    await visitor.close()
  })

  test('변경이 남은 채로 편집 종료 → 확인 창', async () => {
    await enterEditMode(page)
    await editHeroTitle(page, '저장 안 한 변경')

    await page.getByRole('button', { name: '편집 종료' }).click()
    const dialog = page.getByRole('dialog', { name: '저장되지 않은 변경사항이 있습니다' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '그냥 종료' }).click()
    await expect(page.getByRole('toolbar', { name: '편집 모드 툴바' })).toHaveCount(0)
  })

  test('저장 실패 시 에러 안내 + 변경사항 유지', async () => {
    await page.route('**/api/v1/edit/batch-save', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: '서버 오류' },
        }),
      }),
    )
    await enterEditMode(page)
    await editHeroTitle(page, '실패할 변경')

    await saveButton(page).click()
    await expect(page.getByText('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')).toBeVisible()
    await expect(saveButton(page)).toHaveAccessibleName('저장 (1개 변경사항)')
  })
})
