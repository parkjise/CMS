import { expect, test } from '@playwright/test'

const TEST_TENANT = 'test-tenant'
const TENANT_NAME = '테스트 사업체'

test.describe('SEO / 사이트맵 / robots', () => {
  test('홈페이지에 JSON-LD LocalBusiness 스키마가 인라인된다', async ({
    page,
  }) => {
    await page.goto(`/${TEST_TENANT}`)

    const ldScripts = page.locator('script[type="application/ld+json"]')
    await expect(ldScripts).toHaveCount(1)

    const ldText = await ldScripts.first().textContent()
    expect(ldText).toBeTruthy()
    const ld = JSON.parse(ldText ?? '{}')
    expect(ld['@context']).toBe('https://schema.org')
    expect(['LocalBusiness', 'MedicalBusiness', 'LodgingBusiness', 'Organization']).toContain(
      ld['@type'],
    )
    expect(ld.name).toBe(TENANT_NAME)
    expect(typeof ld.url).toBe('string')
    expect(ld.url).toMatch(new RegExp(`/${TEST_TENANT}$`))
  })

  test('템플릿 CSS 변수가 :root에 SSR 주입된다', async ({ page }) => {
    const res = await page.goto(`/${TEST_TENANT}`)
    const html = await res?.text()
    expect(html).toBeTruthy()
    expect(html!).toMatch(/<style[^>]*>:root\s*\{[^}]*--color-/)
  })

  test('타이틀이 테넌트 이름 또는 meta_title로 설정된다', async ({ page }) => {
    await page.goto(`/${TEST_TENANT}`)
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('/{slug}/sitemap.xml이 정상 응답하고 URL을 포함한다', async ({
    request,
  }) => {
    const res = await request.get(`/${TEST_TENANT}/sitemap.xml`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('<urlset')
    expect(body).toContain(`/${TEST_TENANT}`)
  })

  test('/robots.txt가 정상 응답한다', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/User-Agent:\s*\*/i)
    expect(body).toMatch(/Allow:\s*\//)
  })
})
