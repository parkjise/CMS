import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SocialCallback from '@/components/member/SocialCallback'
import SocialHandoff from '@/components/member/SocialHandoff'
import { GET as robotsGet } from '@/app/robots.txt/route'
import { GET as sitemapGet } from '@/app/[tenant_slug]/sitemap.xml/route'
import { exchangeSocialHandoff } from '@/lib/memberAuth'
import { completeSocialCallback } from '@/lib/memberSocial'
import { fetchPublicSite } from '@/lib/publicSite'
import { useMemberStore } from '@/lib/memberStore'
import type { PublicSite } from '@/lib/publicSite.types'

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => search }))
vi.mock('@/lib/memberSocial', async (original) => ({
  ...(await original<typeof import('@/lib/memberSocial')>()),
  completeSocialCallback: vi.fn(),
}))
vi.mock('@/lib/memberAuth', async (original) => ({
  ...(await original<typeof import('@/lib/memberAuth')>()),
  exchangeSocialHandoff: vi.fn(),
}))
vi.mock('@/lib/publicSite', () => ({ fetchPublicSite: vi.fn() }))

const siteWith = (robots_txt: string | null) =>
  ({ seo_settings: { robots_txt } }) as unknown as PublicSite

describe('소셜 로그인 — 고객 도메인으로 넘기기 (T-137)', () => {
  beforeEach(() => {
    search = new URLSearchParams({ code: 'c', state: 'clinic.xyz' })
  })

  it('콜백 응답에 handoff_url 이 있으면 그 주소로', async () => {
    vi.mocked(completeSocialCallback).mockResolvedValue({
      status: 'LOGGED_IN',
      return_to: '/about',
      handoff_url: 'https://www.oo.com/member/handoff?code=abc',
    } as never)
    const navigate = vi.fn()
    render(<SocialCallback navigate={navigate} />)
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://www.oo.com/member/handoff?code=abc'),
    )
  })

  it('계정 연결은 원래 도메인의 화면으로 돌아간다', async () => {
    vi.mocked(completeSocialCallback).mockResolvedValue({
      status: 'LINKED',
      provider: 'KAKAO',
      return_to: '/member/mypage',
      return_origin: 'https://www.oo.com',
    } as never)
    const navigate = vi.fn()
    render(<SocialCallback navigate={navigate} />)
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://www.oo.com/member/mypage?linked=kakao'),
    )
  })

  it('코드를 교환해 세션을 저장하고 이동', async () => {
    search = new URLSearchParams({ code: 'one-time' })
    const session = { access_token: 't', member: { id: 'm' }, return_to: '/about' }
    vi.mocked(exchangeSocialHandoff).mockResolvedValue(session as never)
    const setSession = vi.fn()
    useMemberStore.setState({ setSession })
    const navigate = vi.fn()
    render(<SocialHandoff slug="clinic" navigate={navigate} />)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/about'))
    expect(exchangeSocialHandoff).toHaveBeenCalledWith('clinic', 'one-time')
    expect(setSession).toHaveBeenCalledWith('clinic', session)
  })

  it('만료 · 재사용 코드는 안내', async () => {
    search = new URLSearchParams({ code: 'used' })
    vi.mocked(exchangeSocialHandoff).mockRejectedValue(new Error('expired'))
    render(<SocialHandoff slug="clinic" navigate={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('만료')
  })
})

describe('robots.txt · 사이트맵 (T-137)', () => {
  const fetchMock = vi.fn()
  const req = (host: string, extra: Record<string, string> = {}) =>
    new Request('http://localhost/robots.txt', { headers: { host, ...extra } })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('메인 주소 — 공용 값, 조회 없음', async () => {
    const body = await (await robotsGet(req('localhost:3000'))).text()
    expect(body).toMatch(/User-Agent: \*/)
    expect(body).toMatch(/Allow: \//)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('고객 도메인 — 관리자가 저장한 값', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { slug: 'clinic' } })))
    vi.mocked(fetchPublicSite).mockResolvedValue(siteWith('User-agent: *\nDisallow: /a'))
    expect(await (await robotsGet(req('www.oo.com'))).text()).toBe('User-agent: *\nDisallow: /a\n')
  })

  it('고객 도메인 — 비어 있으면 전체 허용 + 그 도메인 사이트맵', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { slug: 'clinic' } })))
    vi.mocked(fetchPublicSite).mockResolvedValue(siteWith(null))
    const body = await (await robotsGet(req('www.oo.com'))).text()
    expect(body).toContain('Sitemap: https://www.oo.com/sitemap.xml')
  })

  it('사이트맵 — 고객 도메인이면 그 주소', async () => {
    vi.mocked(fetchPublicSite).mockResolvedValue(siteWith(null))
    const res = await sitemapGet(req('www.oo.com', { 'x-site-custom-host': 'www.oo.com' }), {
      params: Promise.resolve({ tenant_slug: 'clinic' }),
    })
    const xml = await res.text()
    expect(xml).toContain('<loc>https://www.oo.com</loc>')
    expect(xml).not.toContain('/clinic')
  })
})
