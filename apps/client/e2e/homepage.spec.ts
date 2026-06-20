import { expect, test } from '@playwright/test'

const TEST_TENANT = 'test-tenant'
const TENANT_NAME = '테스트 사업체'

test.describe('테넌트 홈페이지 기본 렌더링', () => {
  test('Navbar/Footer/FloatingButtons가 노출된다', async ({ page }) => {
    await page.goto(`/${TEST_TENANT}`)

    // Navbar — 테넌트 로고/이름 (Home 이동 버튼)
    const navHome = page.getByRole('button', { name: new RegExp(`${TENANT_NAME} 홈으로`) })
    await expect(navHome).toBeVisible()

    // Footer — 같은 이름 + © 연도
    const footer = page.getByRole('contentinfo')
    await expect(footer).toBeVisible()
    await expect(footer.getByText(TENANT_NAME).first()).toBeVisible()
    await expect(footer.getByText(/© \d{4}/)).toBeVisible()

    // FloatingButtons — 비로그인 상태에서 "관리자 로그인" 버튼
    await expect(
      page.getByRole('button', { name: '관리자 로그인' }),
    ).toBeVisible()
  })

  test('EditModeBanner는 기본 상태에서 노출되지 않는다', async ({ page }) => {
    await page.goto(`/${TEST_TENANT}`)
    await expect(page.getByText('편집 모드 활성화')).toHaveCount(0)
  })

  test('비활성/존재하지 않는 테넌트 → 404 페이지 콘텐츠', async ({ page }) => {
    // 주: Next.js 15 dev에서 notFound() 호출 시 status는 200으로 떨어질 수 있음.
    // 운영 빌드에선 404가 정상 반환된다. 안정적 검증을 위해 페이지 콘텐츠로 검사.
    await page.goto('/__nonexistent-tenant__')
    await expect(page.getByText('홈페이지를 찾을 수 없습니다')).toBeVisible()
  })
})
