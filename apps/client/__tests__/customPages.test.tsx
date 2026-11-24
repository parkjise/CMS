import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicPage, PublicSection, PublicSite } from '@/lib/publicSite.types'

// 직접 만든 페이지 · 페이지별 검색 설정 (T-239, 페이지 관리 기획서)

const { fetchPublicSite, fetchSitemapPosts, renderer } = vi.hoisted(() => ({
  fetchPublicSite: vi.fn<(slug: string) => Promise<PublicSite | null>>(),
  fetchSitemapPosts: vi.fn(),
  renderer: vi.fn(),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/publicSite', () => ({ fetchPublicSite: (slug: string) => fetchPublicSite(slug) }))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchSitemapPosts,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/templates/CodeTemplateRenderer', () => ({
  CodeTemplateRenderer: (props: { pageKey: string }) => {
    renderer(props)
    return <div data-testid="code-template">{props.pageKey}</div>
  },
}))
vi.mock('@/components/edit/EditToolbar', () => ({ EditToolbar: () => null }))
vi.mock('@/components/layout/FloatingButtons', () => ({ FloatingButtons: () => null }))

import { GET } from '@/app/[tenant_slug]/sitemap.xml/route'
import { CodeRoutePage, codeRouteMetadata } from '@/templates/codeRoute'
import { hospitalAEntry } from '@/templates/hospital-a/entry'
import { hospitalAManifest } from '@/templates/hospital-a/manifest'
import { resolvePageSections } from '@/templates/shared/resolveSections'

const page = (key: string, over: Partial<PublicPage> = {}): PublicPage => ({
  page_key: key,
  title: key,
  origin: 'CUSTOM',
  parent_key: null,
  show_in_menu: true,
  is_public: true,
  seo_title: null,
  seo_description: null,
  og_image_url: null,
  noindex: false,
  ...over,
})

const section = (
  id: string,
  type: string,
  pageKey: string,
  order: number,
  active = true
): PublicSection => ({
  id,
  section_type: type,
  label: id,
  display_order: order,
  is_active: active,
  page_key: pageKey,
  settings: [],
})

const site = (pages: PublicPage[], sections: PublicSection[] = []): PublicSite =>
  ({
    tenant: {
      id: 't',
      slug: 'demo',
      name: '데모',
      template_type: 'HOSPITAL',
      plan_type: 'STANDARD',
      custom_domain: null,
    },
    sections,
    seo_settings: null,
    sns_settings: null,
    template: { renderer: 'code', code: 'TPL_HOSPITAL_A' },
    boards: [],
    pages,
  }) as unknown as PublicSite

const route = (path?: string[]) =>
  CodeRoutePage({ entry: hospitalAEntry, params: { tenant_slug: 'demo', path }, searchParams: {} })
const meta = (path?: string[]) => codeRouteMetadata(hospitalAEntry, { tenant_slug: 'demo', path })

beforeEach(() => {
  vi.clearAllMocks()
  fetchSitemapPosts.mockResolvedValue([])
})

describe('코드형 템플릿 — 직접 만든 페이지 라우트', () => {
  it('공개된 직접 페이지는 그 주소로 그린다', async () => {
    fetchPublicSite.mockResolvedValue(site([page('event', { title: '겨울 이벤트' })]))
    render(await route(['event']))
    expect(screen.getByTestId('code-template')).toHaveTextContent('event')
    expect((await meta(['event'])).title).toBe('겨울 이벤트 | 데모')
  })

  it('없는 · 숨긴(응답에 없음) 페이지, 상세 주소는 404', async () => {
    fetchPublicSite.mockResolvedValue(site([page('event')]))
    await expect(route(['nope'])).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(route(['event', '1'])).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('숨긴 템플릿 기본 페이지는 404, 홈은 숨김이어도 그린다', async () => {
    fetchPublicSite.mockResolvedValue(
      site([
        page('about', { origin: 'TEMPLATE', is_public: false }),
        page('home', { origin: 'TEMPLATE', is_public: false }),
      ])
    )
    await expect(route(['about'])).rejects.toThrow('NEXT_NOT_FOUND')
    render(await route())
    expect(screen.getByTestId('code-template')).toHaveTextContent('home')
    // pages 가 없는 예전 응답(캐시)은 지금처럼 모두 공개
    fetchPublicSite.mockResolvedValue({ ...site([]), pages: undefined })
    render(await route(['about']))
  })
})

describe('페이지별 검색 설정', () => {
  it('검색 제목 · 설명 · 공유 이미지, 검색 결과 제외', async () => {
    fetchPublicSite.mockResolvedValue(
      site([
        page('event', {
          seo_title: '이벤트 안내',
          seo_description: '겨울 한정',
          og_image_url: 'https://cdn/x.png',
          noindex: true,
        }),
      ])
    )
    expect(await meta(['event'])).toMatchObject({
      title: '이벤트 안내',
      description: '겨울 한정',
      openGraph: { title: '이벤트 안내', description: '겨울 한정', images: ['https://cdn/x.png'] },
      robots: { index: false, follow: false },
    })
  })

  it('템플릿 기본 페이지에도 적용, 비우면 robots 키를 넣지 않는다 (레이아웃 설정 T-129)', async () => {
    fetchPublicSite.mockResolvedValue(
      site([page('about', { origin: 'TEMPLATE', seo_title: '소개' })])
    )
    const about = await meta(['about'])
    expect(about.title).toBe('소개')
    expect(about).not.toHaveProperty('robots')
    fetchPublicSite.mockResolvedValue(site([]))
    expect(await meta(['about'])).not.toHaveProperty('robots')
  })
})

describe('직접 만든 페이지 섹션', () => {
  it('그 페이지의 켜진 섹션 중 템플릿이 그릴 수 있는 것만 순서대로, 샘플 없이', () => {
    const sections = [
      section('b', 'CONTENT_BLOCK', 'event', 2),
      section('a', 'SUB_HERO', 'event', 1),
      section('off', 'CONTENT_BLOCK', 'event', 3, false),
      section('theme', 'GALLERY', 'event', 4),
      section('other', 'CONTENT_BLOCK', 'about', 1),
    ]
    const resolved = resolvePageSections(
      hospitalAManifest,
      hospitalAEntry.sample,
      sections,
      'event'
    )
    expect(resolved.map((r) => [r.section.id, r.editable, r.sampleKeys])).toEqual([
      ['a', true, []],
      ['b', true, []],
    ])
  })
})

describe('사이트맵', () => {
  const urls = async () => {
    const res = await GET(new Request('http://x/sitemap.xml'), {
      params: Promise.resolve({ tenant_slug: 'demo' }),
    })
    return [...(await res.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
  }

  it('직접 만든 공개 페이지를 넣고, 숨김 · 검색 제외 페이지는 뺀다', async () => {
    fetchPublicSite.mockResolvedValue(
      site([
        page('event'),
        page('quiet', { noindex: true }),
        page('about', { origin: 'TEMPLATE', is_public: false }),
        page('business', { origin: 'TEMPLATE', noindex: true }),
      ])
    )
    const found = await urls()
    expect(found).toContain('http://localhost:3000/demo/event')
    expect(found).toContain('http://localhost:3000/demo/notice')
    for (const gone of ['quiet', 'about', 'business'])
      expect(found).not.toContain(`http://localhost:3000/demo/${gone}`)
  })
})
