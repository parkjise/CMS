import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { PublicPage, PublicSection, PublicSite } from '@/lib/publicSite.types'

// 관리자 미리보기 — 직접 만든 페이지 · 숨김 페이지 (T-244, 페이지 관리 기획서 PM-06)

const { fetchSectionDraft, renderer } = vi.hoisted(() => ({
  fetchSectionDraft: vi.fn<(slug: string, token: string) => Promise<PublicSite | null>>(),
  renderer: vi.fn(),
}))
vi.mock('@/lib/publicSite', () => ({
  fetchSectionDraft: (slug: string, token: string) => fetchSectionDraft(slug, token),
  fetchPublicSite: vi.fn(),
  fetchTemplatePreview: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/templates/CodeTemplateRenderer', () => ({
  CodeTemplateRenderer: (props: { pageKey: string; site: PublicSite }) => {
    renderer(props)
    return <div data-testid="code-template">{props.pageKey}</div>
  },
}))
vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/sections/SectionRenderer', () => ({
  SectionRenderer: ({ section }: { section: { id: string } }) => (
    <div data-testid="section">{section.id}</div>
  ),
}))

import TemplatePreviewPage from '@/app/[tenant_slug]/preview/page'
import { previewDevice, previewDeviceHref } from '@/lib/previewDevice'

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

const section = (id: string, type: string, pageKey: string, order = 0): PublicSection => ({
  id,
  section_type: type,
  label: id,
  display_order: order,
  is_active: true,
  page_key: pageKey,
  settings: [],
})

const site = (template: 'code' | 'theme', pages: PublicPage[], sections: PublicSection[] = []) =>
  ({
    tenant: { id: 't', slug: 'demo', name: '데모', template_type: 'HOSPITAL', plan_type: 'STANDARD' },
    sections,
    seo_settings: null,
    sns_settings: null,
    template:
      template === 'code'
        ? { renderer: 'code', code: 'TPL_HOSPITAL_A' }
        : { renderer: 'theme', code: 'HOSPITAL_CLEAN' },
    boards: [],
    pages,
  }) as unknown as PublicSite

// 미리보기 화면은 [비동기 SectionDraftPreview 요소, 기기 폭 버튼] 을 돌려준다 — 앞쪽을 한 번 더 풀어 그린다
type AsyncElement = { type: (props: unknown) => Promise<React.ReactElement>; props: unknown }
type Wrapped = { props: { children: [AsyncElement, React.ReactElement] } }
const open = async (page?: string, device?: string) => {
  const el = (await TemplatePreviewPage({
    params: Promise.resolve({ tenant_slug: 'demo' }),
    searchParams: Promise.resolve({ draft: 'tok', page, device }),
  })) as unknown as Wrapped
  const [draft, devices] = el.props.children
  return (
    <>
      {await draft.type(draft.props)}
      {devices}
    </>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('관리자 미리보기 — 직접 만든 페이지 (T-244)', () => {
  it('코드형: 숨김 직접 페이지도 그 페이지로 그리고, 공개처럼 넘긴다', async () => {
    fetchSectionDraft.mockResolvedValue(site('code', [page('event', { is_public: false })]))
    render(await open('event'))
    expect(screen.getByTestId('code-template')).toHaveTextContent('event')
    const passed = renderer.mock.calls[0][0].site as PublicSite
    expect(passed.pages?.find((p) => p.page_key === 'event')?.is_public).toBe(true)
    expect(screen.getByText(/저장 전 미리보기|미리보기/)).toBeInTheDocument()
  })

  it('코드형: 숨긴 템플릿 기본 페이지도 미리보기에서는 공개처럼', async () => {
    fetchSectionDraft.mockResolvedValue(
      site('code', [page('about', { origin: 'TEMPLATE', is_public: false })]),
    )
    render(await open('about'))
    const passed = renderer.mock.calls[0][0].site as PublicSite
    expect(passed.pages?.[0].is_public).toBe(true)
  })

  it('테마형: 직접 페이지면 그 페이지 제목 · 섹션만, 없는 주소는 404', async () => {
    fetchSectionDraft.mockResolvedValue(
      site(
        'theme',
        [page('event', { title: '겨울 이벤트', is_public: false })],
        [section('ev', 'INTRO', 'event'), section('home-intro', 'INTRO', 'home')],
      ),
    )
    render(await open('event'))
    expect(screen.getByRole('heading', { level: 1, name: '겨울 이벤트' })).toBeInTheDocument()
    expect(screen.getAllByTestId('section').map((el) => el.textContent)).toEqual(['ev'])
    await expect(open('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('테마형: 페이지를 안 주면 지금처럼 홈', async () => {
    fetchSectionDraft.mockResolvedValue(
      site('theme', [], [section('home-intro', 'INTRO', 'home'), section('ev', 'INTRO', 'event')]),
    )
    render(await open())
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getAllByTestId('section').map((el) => el.textContent)).toEqual(['home-intro'])
  })
})

describe('미리보기 기기 폭 (T-246, PM-03)', () => {
  it('PC 미리보기 아래에 PC · 태블릿 · 휴대폰 — 지금 주소 그대로 device 만 바꾼다', async () => {
    fetchSectionDraft.mockResolvedValue(site('code', [page('event')]))
    render(await open('event'))
    const nav = screen.getByRole('navigation', { name: '미리보기 기기 폭' })
    expect(within(nav).getByRole('link', { name: 'PC' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: '휴대폰' })).toHaveAttribute(
      'href',
      '?draft=tok&page=event&device=mobile',
    )
  })

  it('휴대폰 · 태블릿은 그 폭 틀 안에 같은 미리보기(device 없이), 내용은 틀 안에서 읽는다', async () => {
    const el = await TemplatePreviewPage({
      params: Promise.resolve({ tenant_slug: 'demo' }),
      searchParams: Promise.resolve({ draft: 'tok', page: 'event', device: 'mobile' }),
    })
    render(el)
    const frame = screen.getByTitle('휴대폰 폭 미리보기')
    expect(frame).toHaveAttribute('src', '?draft=tok&page=event')
    expect(frame.className).toContain('w-[390px]')
    expect(screen.getByRole('link', { name: '휴대폰' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '태블릿' })).toHaveAttribute(
      'href',
      '?draft=tok&page=event&device=tablet',
    )
    expect(fetchSectionDraft).not.toHaveBeenCalled()
  })

  it('모르는 device 값은 PC', () => {
    expect(previewDevice('watch')).toBe('pc')
    expect(previewDevice(undefined)).toBe('pc')
    expect(previewDevice('tablet')).toBe('tablet')
    expect(previewDeviceHref({ tpl: 'A', device: 'tablet', x: ['a', 'b'] }, 'pc')).toBe('?tpl=A')
  })
})
