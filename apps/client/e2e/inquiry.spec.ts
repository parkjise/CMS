import { expect, test } from '@playwright/test'

const TEST_TENANT = 'test-tenant'

// 전제: 백엔드(:8000) + 시드(scripts/seed.py — test-tenant 홈 CONTACT 섹션 포함, T-051-A)
// test-tenant 업종은 GENERAL → 일반 업무 폼 (회사명 · 문의 분야)
// 문의 접수는 IP 당 분당 3회 제한 — 연달아 돌려도 걸리지 않게 실행당 1회만 접수한다 (T-066-A)
test.describe('문의 제출 플로우', () => {
  test('기본 칸 + 업종별 칸(회사명 · 문의 분야)을 입력해 접수하면 성공 토스트', async ({
    page,
  }) => {
    await page.goto(`/${TEST_TENANT}`)
    const contactSection = page.locator('[data-section-type="CONTACT"]')
    await expect(contactSection).toBeVisible()

    // 업종 칸 목록을 받아 그린다 (GET /api/public/inquiries/fields)
    const company = contactSection.getByLabel('회사명')
    await expect(company).toBeVisible()
    await expect(contactSection.getByRole('option', { name: '증상 문의' })).toHaveCount(0)

    const submitted = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' && /\/public\/inquiries(\?|$)/.test(res.url()),
    )
    await contactSection.getByLabel(/문의 유형/).selectOption('GENERAL')
    await company.fill('주식회사 테스트')
    await contactSection.getByLabel('문의 분야').selectOption('QUOTE')
    await contactSection.getByLabel(/이름/).fill('테스트 사용자')
    await contactSection.getByLabel(/휴대폰 번호/).fill('010-1234-5678')
    await contactSection
      .getByLabel(/문의 내용/)
      .fill('견적 문의드립니다. 홈페이지 제작 비용이 궁금합니다.')
    await contactSection.getByRole('button', { name: /문의 보내기/ }).click()

    const res = await submitted
    expect(res.request().postDataJSON().detail).toEqual({
      company: '주식회사 테스트',
      topic: 'QUOTE',
    })
    expect(res.status(), '429 면 1분 안에 너무 자주 돌린 것 — 잠시 후 다시').toBe(200)
    await expect(page.getByText(/문의가 접수되었습니다/)).toBeVisible({ timeout: 10_000 })
  })
})
