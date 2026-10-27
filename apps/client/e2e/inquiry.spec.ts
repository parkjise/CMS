import { expect, test } from '@playwright/test'

const TEST_TENANT = 'test-tenant'

// 전제: 백엔드(:8000) + 시드(scripts/seed.py — test-tenant 홈 CONTACT 섹션 포함, T-051-A)
// test-tenant 업종은 GENERAL → 일반 업무 폼 (회사명 · 문의 분야)
test.describe('문의 제출 플로우', () => {
  test('이름/연락처/내용을 입력하고 제출하면 성공 토스트가 노출된다', async ({ page }) => {
    await page.goto(`/${TEST_TENANT}`)

    const contactSection = page.locator('[data-section-type="CONTACT"]')
    await expect(contactSection).toBeVisible()

    await contactSection.getByLabel(/문의 유형/).selectOption('GENERAL')
    await contactSection.getByLabel(/이름/).fill('테스트 사용자')
    await contactSection.getByLabel(/휴대폰 번호/).fill('010-1234-5678')
    await contactSection
      .getByLabel(/문의 내용/)
      .fill('E2E 테스트 문의입니다. 정상 접수되는지 확인합니다.')
    await contactSection.getByRole('button', { name: /문의 보내기/ }).click()

    await expect(page.getByText(/문의가 접수되었습니다/)).toBeVisible({ timeout: 10_000 })
  })

  test('업종별 추가 칸(회사명 · 문의 분야)을 함께 접수한다', async ({ page }) => {
    await page.goto(`/${TEST_TENANT}`)
    const contactSection = page.locator('[data-section-type="CONTACT"]')

    // 업종 칸 목록을 받아 그린다 (GET /api/public/inquiries/fields)
    const company = contactSection.getByLabel('회사명')
    await expect(company).toBeVisible()
    await expect(contactSection.getByRole('option', { name: '증상 문의' })).toHaveCount(0)

    const submitted = page.waitForRequest(
      (req) => req.method() === 'POST' && /\/public\/inquiries(\?|$)/.test(req.url()),
    )
    await company.fill('주식회사 테스트')
    await contactSection.getByLabel('문의 분야').selectOption('QUOTE')
    await contactSection.getByLabel(/이름/).fill('테스트 사용자')
    await contactSection.getByLabel(/휴대폰 번호/).fill('010-1234-5678')
    await contactSection
      .getByLabel(/문의 내용/)
      .fill('견적 문의드립니다. 홈페이지 제작 비용이 궁금합니다.')
    await contactSection.getByRole('button', { name: /문의 보내기/ }).click()

    const body = (await submitted).postDataJSON()
    expect(body.detail).toEqual({ company: '주식회사 테스트', topic: 'QUOTE' })
    await expect(page.getByText(/문의가 접수되었습니다/)).toBeVisible({ timeout: 10_000 })
  })
})
