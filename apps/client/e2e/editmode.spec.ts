import { expect, test, type Page } from '@playwright/test'

const TEST_TENANT = 'test-tenant'

// NOTE:
// 인라인 편집 플로우 E2E는 아래 두 가지를 전제로 한다.
//   1) 백엔드(:8000)가 떠 있고 test-tenant에 편집 가능한 섹션이 시드되어 있을 것
//      (섹션은 Next 서버 컴포넌트에서 SSR되므로 브라우저 레벨 page.route로 모킹 불가).
//   2) GET /api/v1/auth/me 가 로그인 사용자를 반환하도록 인증 쿠키가 준비될 것.
// 현재 시드(scripts/seed.py)는 test-tenant에 섹션을 만들지 않아(=inquiry.spec.ts와 동일 한계)
// 페이지에 편집 대상이 렌더되지 않는다. 통합 테스트는 __tests__/editModeIntegration.test.tsx 에서
// 컴포넌트+스토어 레벨로 결정론적으로 검증하며, 여기서는 시드/테스트 데이터 셋업 도입 후
// `test.skip(true, ...)`를 제거해 전체 플로우를 활성화한다.
test.describe('인라인 편집 모드 E2E', () => {
  test.skip(true, '편집 가능한 섹션 시드 + 인증 쿠키 셋업 후 활성화')

  // 로그인 상태를 모사: 클라이언트의 authStore.initialize() 가 호출하는 /auth/me 응답을 모킹.
  const mockLoggedIn = async (page: Page) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'user-1',
            email: 'admin@test.com',
            role: 'TENANT_ADMIN',
            tenant_id: 'tenant-1',
          },
          meta: { timestamp: new Date().toISOString(), version: '1.0' },
        }),
      }),
    )
  }

  const enterEditMode = async (page: Page) => {
    await page.goto(`/${TEST_TENANT}`)
    await page.getByRole('button', { name: '편집 모드' }).click()
    await expect(page.getByRole('toolbar', { name: '편집 모드 툴바' })).toBeVisible()
  }

  test('편집 모드 진입 → 텍스트 변경 → 이미지 업로드 → 저장', async ({ page }) => {
    await mockLoggedIn(page)

    let batchSaveBody: unknown = null
    await page.route('**/api/v1/edit/batch-save', async (route) => {
      batchSaveBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { saved_count: 2, failed_count: 0, cache_purged: true },
        }),
      })
    })
    await page.route('**/api/v1/upload/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { url: 'https://cdn.test/new-image.webp' },
        }),
      }),
    )

    await enterEditMode(page)

    // 텍스트 인라인 편집
    const heading = page.locator('[data-editable="text"]').first()
    await heading.click()
    await heading.fill('E2E 변경 제목')
    await heading.blur()

    // 이미지 업로드 (파일 선택 → presigned 업로드 모킹)
    const image = page.locator('[data-editable="image"]').first()
    await image.click()
    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-image-bytes'),
      })

    // 저장
    await page.getByLabel(/저장 \(/).click()
    await expect(page.getByText(/저장/)).toBeVisible()
    expect(batchSaveBody).toMatchObject({
      changes: expect.arrayContaining([
        expect.objectContaining({ field: expect.any(String) }),
      ]),
    })
  })

  test('이탈 방지: 변경사항이 있는 채로 종료 시 확인 다이얼로그', async ({ page }) => {
    await mockLoggedIn(page)
    await enterEditMode(page)

    const heading = page.locator('[data-editable="text"]').first()
    await heading.click()
    await heading.fill('저장 안 한 변경')
    await heading.blur()

    await page.getByRole('button', { name: '편집 종료' }).click()
    await expect(
      page.getByRole('dialog', { name: '저장되지 않은 변경사항이 있습니다' }),
    ).toBeVisible()
  })

  test('저장 실패 시 에러 토스트 + 변경사항 유지(롤백)', async ({ page }) => {
    await mockLoggedIn(page)
    await page.route('**/api/v1/edit/batch-save', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: '저장 실패' },
        }),
      }),
    )

    await enterEditMode(page)
    const heading = page.locator('[data-editable="text"]').first()
    await heading.click()
    await heading.fill('실패할 변경')
    await heading.blur()

    await page.getByLabel(/저장 \(/).click()
    await expect(page.getByText(/실패/)).toBeVisible()
    // 변경사항이 유지되어 저장 버튼이 여전히 활성(카운트 > 0)
    await expect(page.getByLabel(/저장 \([1-9]/)).toBeVisible()
  })
})
