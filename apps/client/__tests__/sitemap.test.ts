import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicSite } from '@/lib/publicSite.types'

const { fetchPublicSite, fetchSitemapPosts } = vi.hoisted(() => ({
  fetchPublicSite: vi.fn(),
  fetchSitemapPosts: vi.fn(),
}))
vi.mock('@/lib/publicSite', () => ({ fetchPublicSite }))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchSitemapPosts,
}))

import { GET } from '@/app/[tenant_slug]/sitemap.xml/route'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'

const news = { id: 'b1', name: '소식', slug: 'news', description: '', board_type: 'LIST' }
const site = (overrides: Partial<PublicSite> = {}): PublicSite =>
  ({
    tenant: { id: 't', slug: 'demo', name: '데모' },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template: { renderer: 'code', code: 'TPL_HOSPITAL_A' },
    boards: [news],
    ...overrides,
  }) as unknown as PublicSite

const post = (board_slug: string, id: string, is_system = false, updated_at = '2026-11-01T00:00:00Z') => ({
  board_slug,
  id,
  is_system,
  updated_at,
})

const locs = async (headers: Record<string, string> = {}) => {
  const res = await GET(new Request('http://x/sitemap.xml', { headers }), {
    params: Promise.resolve({ tenant_slug: 'demo' }),
  })
  const xml = await res.text()
  return { xml, urls: [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]) }
}

const BASE = 'http://localhost:3000/demo'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  fetchPublicSite.mockResolvedValue(site())
  fetchSitemapPosts.mockResolvedValue([])
})

describe('사이트맵 (T-140-C)', () => {
  it('메인 · 템플릿 페이지 · 새 게시판 · 글 주소', async () => {
    fetchSitemapPosts.mockResolvedValue([post('news', 'p1'), post('notice', 'n1', true)])
    const { urls } = await locs()
    expect(urls[0]).toBe(BASE)
    expect(urls).toEqual(
      expect.arrayContaining([
        `${BASE}/about`,
        `${BASE}/notice`,
        `${BASE}/b/news`,
        `${BASE}/b/news/p1`,
        `${BASE}/notice/n1`,
      ]),
    )
    expect(urls).not.toContain(`${BASE}/home`)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('글은 실제 수정일, 게시판은 가장 최근 글의 수정일', async () => {
    fetchSitemapPosts.mockResolvedValue([
      post('news', 'p2', false, '2026-11-03T00:00:00Z'),
      post('news', 'p1', false, '2026-11-01T00:00:00Z'),
    ])
    const { xml } = await locs()
    expect(xml).toMatch(/b\/news<\/loc>\s*<lastmod>2026-11-03T00:00:00Z/)
    expect(xml).toMatch(/b\/news\/p1<\/loc>\s*<lastmod>2026-11-01T00:00:00Z/)
  })

  it('고객 도메인이면 주소에 slug 가 없다', async () => {
    fetchSitemapPosts.mockResolvedValue([post('news', 'p1')])
    const { urls, xml } = await locs({ [CUSTOM_HOST_HEADER]: 'www.oo.com' })
    expect(urls[0]).toBe('https://www.oo.com')
    expect(urls).toContain('https://www.oo.com/b/news/p1')
    expect(xml).not.toContain('/demo')
  })

  it('메뉴에서 숨긴 게시판 · 페이지와 그 글은 뺀다', async () => {
    fetchPublicSite.mockResolvedValue(
      site({
        site_settings: {
          menu_items: [
            { key: 'board:b1', label: null, visible: false },
            { key: 'notice', label: null, visible: false },
            { key: 'about', label: '소개', visible: true },
          ],
        } as PublicSite['site_settings'],
      }),
    )
    fetchSitemapPosts.mockResolvedValue([post('news', 'p1'), post('notice', 'n1', true)])
    const { urls } = await locs()
    expect(urls).toContain(`${BASE}/about`)
    expect(urls.join()).not.toContain('/b/news')
    expect(urls.join()).not.toContain('/notice')
  })

  it('사이트 응답에 없는 게시판(사용 끔)의 글은 뺀다', async () => {
    fetchSitemapPosts.mockResolvedValue([post('gone', 'p1')])
    const { urls } = await locs()
    expect(urls.join()).not.toContain('gone')
  })

  it('테마형은 페이지 · 공지 없이 메인과 새 게시판 · 글만 (T-141)', async () => {
    fetchPublicSite.mockResolvedValue(site({ template: { renderer: 'theme', code: 'X' } as PublicSite['template'] }))
    fetchSitemapPosts.mockResolvedValue([post('news', 'p1'), post('notice', 'n1', true)])
    expect((await locs()).urls).toEqual([BASE, `${BASE}/b/news`, `${BASE}/b/news/p1`])
  })

  it('글 조회가 실패해도 메인 · 페이지는 나온다', async () => {
    fetchSitemapPosts.mockResolvedValue(null)
    const { urls } = await locs()
    expect(urls).toContain(BASE)
    expect(urls).toContain(`${BASE}/about`)
  })

  it('없는 사업체는 빈 사이트맵', async () => {
    fetchPublicSite.mockResolvedValue(null)
    expect((await locs()).urls).toEqual([])
  })

  it('검색 노출을 끈 게시판은 글까지 빠진다 (T-146)', async () => {
    fetchPublicSite.mockResolvedValue(site({ boards: [{ ...news, board_type: 'LIST' as const, seo_index: false }] }))
    fetchSitemapPosts.mockResolvedValue([post('news', 'p1')])
    const { urls } = await locs()
    expect(urls.some((url) => url.includes('/b/news'))).toBe(false)
  })
})
