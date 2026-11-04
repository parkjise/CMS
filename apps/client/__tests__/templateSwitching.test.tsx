import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { PublicSite } from '@/lib/publicSite.types'

const fetchPublicSite = vi.fn<(slug: string) => Promise<PublicSite | null>>()
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/publicSite', () => ({ fetchPublicSite: (slug: string) => fetchPublicSite(slug) }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
// 실제 템플릿 화면은 여기서 그리지 않는다 — 전환 · 404 분기만 본다
vi.mock('@/templates/CodeTemplateRenderer', () => ({
  CodeTemplateRenderer: () => <div data-testid="code-template" />,
}))
vi.mock('@/components/edit/EditToolbar', () => ({ EditToolbar: () => null }))
vi.mock('@/components/layout/FloatingButtons', () => ({ FloatingButtons: () => null }))
vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))

import TenantHomePage, { generateMetadata } from '@/app/[tenant_slug]/page'
import { CodeRoutePage, codeRouteMetadata } from '@/templates/codeRoute'
import { hospitalAEntry } from '@/templates/hospital-a/entry'
import {
  MAX_RELOADS,
  RELOAD_DELAY_MS,
  TemplateSwitching,
  claimReload,
} from '@/templates/shared/TemplateSwitching'

const siteWith = (template: PublicSite['template']): PublicSite => ({
  tenant: { id: 't', slug: 'demo', name: '데모', template_type: 'HOSPITAL', plan_type: 'BASIC', custom_domain: null },
  sections: [],
  seo_settings: null,
  sns_settings: null,
  template,
})
const THEME = { renderer: 'theme', code: 'HOSPITAL_CLEAN' } as PublicSite['template']
const CODE = { renderer: 'code', code: 'TPL_HOSPITAL_A' } as PublicSite['template']

const codePage = (path?: string[]) =>
  CodeRoutePage({ entry: hospitalAEntry, params: { tenant_slug: 'demo', path }, searchParams: {} })
const themePage = () => TenantHomePage({ params: Promise.resolve({ tenant_slug: 'demo' }) })

beforeEach(() => {
  sessionStorage.clear()
  fetchPublicSite.mockReset()
})

describe('코드형 템플릿 라우트 — 템플릿을 바꾼 직후 (T-037-F)', () => {
  it('지금 쓰는 템플릿이면 그대로 그린다', async () => {
    fetchPublicSite.mockResolvedValue(siteWith(CODE))
    render(await codePage())
    expect(screen.getByTestId('code-template')).toBeInTheDocument()
  })

  it('방금 테마형으로 바꿨으면 404 대신 전환 안내 + 색인 제외', async () => {
    fetchPublicSite.mockResolvedValue(siteWith(THEME))
    render(await codePage())
    expect(screen.getByRole('heading', { name: /새로 단장하는 중/ })).toBeInTheDocument()
    expect(await codeRouteMetadata(hospitalAEntry, { tenant_slug: 'demo' })).toEqual({
      robots: { index: false, follow: false },
    })
  })

  it('서브 페이지 메타에 robots 키를 넣지 않는다 — 레이아웃의 검색 노출 설정을 덮어쓰지 않게 (T-129)', async () => {
    fetchPublicSite.mockResolvedValue(siteWith(CODE))
    const meta = await codeRouteMetadata(hospitalAEntry, { tenant_slug: 'demo', path: ['about'] })
    expect(meta).not.toHaveProperty('robots')
    expect(meta.title).toContain('데모')
  })

  it('없는 테넌트 · 없는 페이지는 여전히 404', async () => {
    fetchPublicSite.mockResolvedValue(null)
    await expect(codePage()).rejects.toThrow('NEXT_NOT_FOUND')
    fetchPublicSite.mockResolvedValue(siteWith(THEME))
    await expect(codePage(['no-such-page'])).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('테마형 홈 — 방금 코드형으로 바꾼 경우 (T-037-F)', () => {
  it('코드형 사이트면 깨진 테마 화면 대신 전환 안내 + 색인 제외', async () => {
    fetchPublicSite.mockResolvedValue(siteWith(CODE))
    render(await themePage())
    expect(screen.getByRole('heading', { name: /새로 단장하는 중/ })).toBeInTheDocument()
    expect(await generateMetadata({ params: Promise.resolve({ tenant_slug: 'demo' }) })).toEqual({
      robots: { index: false, follow: false },
    })
  })

  it('테마형 사이트 · 모르는 코드형 템플릿이면 평소대로 그린다', async () => {
    for (const template of [THEME, { renderer: 'code', code: 'TPL_UNKNOWN' } as PublicSite['template']]) {
      fetchPublicSite.mockResolvedValue(siteWith(template))
      const { unmount } = render(await themePage())
      expect(screen.queryByRole('heading', { name: /새로 단장하는 중/ })).toBeNull()
      expect(await generateMetadata({ params: Promise.resolve({ tenant_slug: 'demo' }) })).toEqual({})
      unmount()
    }
  })
})

describe('전환 안내 화면 다시 불러오기', () => {
  const reload = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    reload.mockReset()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/demo', reload },
    })
  })
  afterEach(() => vi.useRealTimers())

  it('1초 뒤 다시 불러온다', () => {
    render(<TemplateSwitching />)
    expect(reload).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it(`같은 주소에서 ${MAX_RELOADS}번 넘으면 멈추고 새로고침 버튼`, () => {
    for (let i = 0; i < MAX_RELOADS; i++) expect(claimReload('/demo')).toBe(true)
    render(<TemplateSwitching />)
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS * 3))
    expect(reload).not.toHaveBeenCalled()
    screen.getByRole('button', { name: '새로고침' }).click()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('30초 지난 기록은 새 전환으로 보고 다시 센다', () => {
    const t0 = 1_000_000
    for (let i = 0; i < MAX_RELOADS; i++) claimReload('/demo', t0)
    expect(claimReload('/demo', t0 + 1_000)).toBe(false)
    expect(claimReload('/demo', t0 + 31_000)).toBe(true)
    expect(claimReload('/other', t0 + 1_000)).toBe(true)
  })

  it('저장소를 못 쓰면 다시 불러오지 않는다 (무한 반복 방지)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked')
      },
    })
    try {
      expect(claimReload('/demo')).toBe(false)
    } finally {
      Object.defineProperty(window, 'sessionStorage', original)
    }
  })
})
