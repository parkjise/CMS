import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCustomHost, sitePath } from '@/lib/siteHost'
import { browserApiBase } from '@/lib/apiBase'
import { safeNext } from '@/lib/memberAuth'
import { pageHref } from '@/templates/shared/contracts'

// 고객 도메인 판단 · 주소 (T-137)
const at = (hostname: string) => vi.stubGlobal('location', { hostname })

afterEach(() => vi.unstubAllGlobals())

describe('isCustomHost', () => {
  it.each([
    ['www.oo.com', true],
    ['OO-HOSPITAL.co.kr', true],
    ['localhost', false],
    ['client', false],
    ['127.0.0.1', false],
    ['[::1]', false],
    ['', false],
  ])('%s → %s', (host, expected) => {
    expect(isCustomHost(host)).toBe(expected)
  })
})

describe('브라우저 주소', () => {
  it('고객 도메인 — slug 없음, API 는 같은 주소', () => {
    at('www.oo.com')
    expect(sitePath('clinic')).toBe('/')
    expect(sitePath('clinic', '/member/login')).toBe('/member/login')
    expect(browserApiBase()).toBe('/api')
  })

  it('메인 주소 — 그대로', () => {
    at('localhost')
    expect(sitePath('clinic')).toBe('/clinic')
    expect(sitePath('clinic', '/member/login')).toBe('/clinic/member/login')
    expect(browserApiBase()).not.toBe('/api')
  })
})

describe('safeNext — 오픈 리다이렉트 방지', () => {
  it('고객 도메인의 slug 없는 경로를 받되 외부 주소는 거부', () => {
    at('www.oo.com')
    expect(safeNext('clinic', '/about')).toBe('/about')
    for (const bad of ['//evil.com', 'https://evil.com', '/\\\\evil.com', 'about']) {
      expect(safeNext('clinic', bad)).toBe('/clinic/member/mypage')
    }
  })

  it('메인 주소는 자기 slug 안에서만', () => {
    at('localhost')
    expect(safeNext('clinic', '/clinic/about')).toBe('/clinic/about')
    expect(safeNext('clinic', '/other/about')).toBe('/clinic/member/mypage')
  })
})

describe('pageHref', () => {
  it('고객 도메인 — slug 없이', () => {
    expect(pageHref('clinic', 'home', undefined, { noSlug: true })).toBe('/')
    expect(pageHref('clinic', 'about', undefined, { noSlug: true })).toBe('/about')
    expect(pageHref('clinic', 'notice', undefined, { noSlug: true, id: '5', p: 2 })).toBe(
      '/notice/5?p=2',
    )
  })

  it('기본은 slug 포함', () => {
    expect(pageHref('clinic', 'home')).toBe('/clinic')
    expect(pageHref('clinic', 'about')).toBe('/clinic/about')
  })
})
