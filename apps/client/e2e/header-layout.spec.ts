import { test, expect } from '@playwright/test'
import { compile } from 'sass'
import { resolve } from 'node:path'

const LONG_BRAND = '아주긴상호명으로등록된우리동네가족건강의원'
const css = compile(resolve(__dirname, '../templates/hospital-a/styles/index.scss')).css
// 실제 템플릿 SCSS + Tailwind preflight에 해당하는 기본 리셋. React 동작은 단위 시험에서 확인한다.
const reset =
  '*{box-sizing:border-box}body,h1,ul{margin:0;padding:0}ul{list-style:none}a{color:inherit;text-decoration:none}button{font:inherit}body{font-family:Arial,sans-serif}'
const accounts = {
  guest:
    '<li><a href="/demo/member/login">로그인</a></li><li><a href="/demo/member/join">회원가입</a></li>',
  member: '<li><a href="/demo/member/mypage">마이페이지</a></li><li><button>로그아웃</button></li>',
  off: '',
}
interface FixtureOptions {
  account: keyof typeof accounts
  logo: boolean
  brand?: string
  collapsed?: boolean
}
// CSS 레이아웃 픽스처: 제품의 Header 마크업/클래스에 대응하며 실제 앱/로그인 요청은 실행하지 않는다.
const fixture = ({ account, logo, brand = LONG_BRAND, collapsed = false }: FixtureOptions) => {
  const image = logo
    ? '<img class="header__logo-image" width="2496" height="1696" alt="" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%222496%22 height=%221696%22%3E%3Crect width=%222496%22 height=%221696%22 fill=%22teal%22/%3E%3C/svg%3E">'
    : ''
  return `<style>${reset}${css}</style><div data-template="hospital-a">
    <header class="header${collapsed ? ' header--collapsed' : ''}"><div class="header__inner">
      <h1 class="header__logo"><a class="header__logo-link" href="/demo">${image}<span class="header__brand" title="${brand}">${brand}</span></a></h1>
      <nav class="header__nav"><ul class="header__menu"><li><a class="header__menu-link" href="/demo/about">소개</a></li></ul></nav>
      <button class="header__menu-toggle" aria-label="전체 메뉴 열기">☰</button>
      <ul class="header__account">${accounts[account]}</ul>
    </div></header></div>`
}

for (const width of [320, 390, 768]) {
  for (const account of ['guest', 'member', 'off'] as const) {
    for (const logo of [false, true]) {
      test(`${width}px ${account} 로고 ${logo}: 긴 상호와 계정/메뉴가 겹치지 않는다`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 800 })
        await page.setContent(fixture({ account, logo }))
        const bounds = await page.locator('.header__inner').evaluate((inner) => ({
          width: inner.clientWidth,
          scroll: inner.scrollWidth,
        }))
        expect(bounds.scroll).toBeLessThanOrEqual(bounds.width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width
        )
        await expect(page.getByRole('button', { name: '전체 메뉴 열기' })).toBeInViewport({
          ratio: 1,
        })
        const brandBox = await page.locator('.header__logo').boundingBox()
        const accountBox = await page.locator('.header__account').boundingBox()
        expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(accountBox!.x)
        for (const item of await page
          .locator('.header__account a, .header__account button')
          .all()) {
          await expect(item).toBeInViewport({ ratio: 1 })
          expect(await item.evaluate((el) => el.getClientRects().length)).toBe(1)
        }
        await expect(page.getByRole('link', { name: LONG_BRAND })).toHaveAttribute('href', '/demo')
        if (width === 390 && account === 'guest' && logo) {
          await page.screenshot({ path: testInfo.outputPath('mobile-header.png') })
        }
      })
    }
  }
}

test('넓은 화면에서 접힌 긴 상호도 말줄임하고 펼친 짧은 상호/메뉴는 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.setContent(
    fixture({ account: 'member', logo: true, collapsed: true, brand: LONG_BRAND.repeat(4) })
  )
  expect(
    await page.locator('.header__inner').evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
  await expect(page.getByRole('button', { name: '전체 메뉴 열기' })).toBeVisible()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.setContent(fixture({ account: 'guest', logo: true, brand: '데모 의원' }))
  await expect(page.getByRole('button', { name: '전체 메뉴 열기' })).toBeHidden()
  await expect(page.getByRole('link', { name: '소개' })).toBeVisible()
  expect(
    await page.locator('.header__brand').evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
})
