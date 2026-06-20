import { expect, test } from '@playwright/test'

const TEST_TENANT = 'test-tenant'

// NOTE:
// 현재 백엔드 시드(scripts/seed.py)는 test-tenant에 Section 데이터를 만들지 않음.
// CONTACT 섹션이 없으면 ContactForm이 페이지에 렌더되지 않아 이 테스트는 의미가 없다.
// 후속 작업으로 시드에 CONTACT 섹션을 추가하거나, 통합 테스트 전용 데이터 셋업을 도입한 후
// `test.skip(true, ...)`를 제거하고 활성화한다.
test.describe('문의 제출 플로우', () => {
  test.skip(true, 'CONTACT 섹션 시드 추가 후 활성화')

  test('이름/연락처/내용을 입력하고 제출하면 성공 토스트가 노출된다', async ({
    page,
  }) => {
    await page.goto(`/${TEST_TENANT}`)

    const contactSection = page.locator('[data-section-type="CONTACT"]')
    await expect(contactSection).toBeVisible()

    await page
      .getByLabel(/문의 유형/)
      .selectOption('GENERAL')
    await page.getByLabel(/이름/).fill('테스트 사용자')
    await page.getByLabel(/휴대폰 번호/).fill('010-1234-5678')
    await page
      .getByLabel(/문의 내용/)
      .fill('E2E 테스트 문의입니다. 정상 접수되는지 확인합니다.')
    await page.getByRole('button', { name: /문의 보내기/ }).click()

    await expect(page.getByText(/문의가 접수되었습니다/)).toBeVisible({
      timeout: 10_000,
    })
  })
})
