import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { PublicSite } from '@/lib/publicSite.types'
import { hospitalAManifest } from '@/templates/hospital-a/manifest'
import { hospitalASample } from '@/templates/hospital-a/sample-content'
import { resolvePageSections, resolveSiteInfo } from '@/templates/shared/resolveSections'

vi.mock('swiper', () => ({
  default: class {
    destroy = vi.fn()
    autoplay = { running: true, start: vi.fn(), stop: vi.fn() }
  },
}))
vi.mock('swiper/modules', () => ({
  A11y: {}, Autoplay: {}, Keyboard: {}, Navigation: {}, Pagination: {}, Thumbs: {},
}))
vi.mock('gsap', () => ({
  gsap: { fromTo: vi.fn(), registerPlugin: vi.fn(), context: () => ({ revert: vi.fn() }) },
}))
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }))
vi.mock('@/lib/api', () => ({ publicApi: { post: vi.fn() } }))
vi.mock('@/lib/recaptcha', () => ({ executeRecaptcha: vi.fn() }))

import HospitalATemplate from '@/templates/hospital-a/Template'
import { RichLine } from '@/templates/hospital-a/components/sub/RichText'

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  }
})

const site: PublicSite = {
  tenant: { id: 't', slug: 'demo', name: '데모', template_type: 'HOSPITAL', plan_type: 'BASIC', custom_domain: null },
  sections: [],
  seo_settings: null,
  sns_settings: null,
  template: null,
}

const renderPage = (pageKey: string, previewQuery?: string) =>
  render(
    <HospitalATemplate
      site={site}
      tenantSlug="demo"
      pageKey={pageKey}
      sections={resolvePageSections(hospitalAManifest, hospitalASample, [], pageKey)}
      siteInfo={resolveSiteInfo(hospitalASample, site)}
      preview={false}
      previewQuery={previewQuery}
    />,
  )

describe('hospital-a 서브 페이지 (T-122)', () => {
  it('샘플 페이지 구성이 매니페스트 페이지 정의와 같다', () => {
    for (const page of hospitalAManifest.pages) {
      const sample = hospitalASample.pages[page.key] ?? []
      expect(sample.map((s) => s.section_type)).toEqual(page.default_sections)
    }
  })

  it('CONTENT_BLOCK 샘플은 모두 렌더링 가능한 layout 을 가진다', () => {
    const layouts = Object.values(hospitalASample.pages)
      .flat()
      .filter((s) => s.section_type === 'CONTENT_BLOCK')
      .map((s) => s.settings.layout)
    expect(new Set(layouts)).toEqual(
      new Set([
        'media-row', 'strength-list', 'area-rows', 'photo-gallery', 'consult-links', 'page-intro',
        'split-story', 'split-story-reverse', 'milestone-split', 'banner-split', 'criteria-cards', 'value-circles',
      ]),
    )
  })

  it('회사소개: 상단 비주얼 + 하위 탭(현재 페이지 표시) + 본문 블록 5개', () => {
    const { container } = renderPage('about')
    expect(screen.getByRole('heading', { level: 2, name: '브랜드 소개' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: '하위 메뉴' })
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent)).toEqual(['브랜드 소개', '연혁', '오시는 길'])
    expect(within(tabs).getByRole('link', { name: '브랜드 소개' })).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('main')).toHaveClass('main--sub')
    for (const block of ['media-row', 'strength-list', 'area-rows', 'photo-gallery', 'consult-links']) {
      expect(container.querySelector(`section.${block}`)).not.toBeNull()
    }
    // 하위 탭은 상단 비주얼 바로 다음 형제 — 목업 .sub-nav + section 규칙 유지
    expect(container.querySelector('.sub-hero + .sub-nav + section')).not.toBeNull()
  })

  it('사업영역: 하위 탭 없이 본문 블록 7개, 더보기 링크는 홈 서비스 섹션으로', () => {
    const { container } = renderPage('business')
    expect(screen.queryByRole('navigation', { name: '하위 메뉴' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('main > section')).toHaveLength(8)
    expect(container.querySelector('.split-story--lined')).not.toBeNull()
    expect(container.querySelector('.split-story--reverse')).not.toBeNull()
    expect(screen.getByRole('link', { name: /서비스 더 알아보기/ })).toHaveAttribute('href', '/demo#services')
  })

  it('연혁: 연도 10개와 구간 탭 4개, 첫 연도가 현재 연도', () => {
    const { container } = renderPage('about-history')
    expect(container.querySelectorAll('.history-timeline__year')).toHaveLength(10)
    const ranges = screen.getByRole('navigation', { name: '연도 구간' })
    expect(within(ranges).getAllByRole('link').map((a) => a.textContent)).toEqual([
      '2026-2024',
      '2023-2020',
      '2019-2016',
      '2015-2012',
    ])
    expect(container.querySelector('.history-timeline__current-year')).toHaveTextContent('2026')
  })

  it('오시는 길: 주소·전화·교통·주차 정보', () => {
    const { container } = renderPage('about-location')
    const location = container.querySelector('section.location') as HTMLElement
    expect(within(location).getByRole('link', { name: '02-1234-5678' })).toHaveAttribute('href', 'tel:0212345678')
    expect(within(location).getByText('대중교통')).toBeInTheDocument()
    expect(within(location).getByText(/서울특별시 강남구/)).toBeInTheDocument()
  })

  it('미리보기에서는 메뉴·탭 링크가 미리보기 주소를 유지한다', () => {
    renderPage('about', 'tpl=TPL_HOSPITAL_A')
    const tabs = screen.getByRole('navigation', { name: '하위 메뉴' })
    expect(within(tabs).getByRole('link', { name: '연혁' })).toHaveAttribute(
      'href',
      '/demo/preview?tpl=TPL_HOSPITAL_A&page=about-history',
    )
  })
})

describe('RichLine (T-122)', () => {
  it('줄바꿈은 <br> + 공백, **굵게**는 <strong>, HTML 은 글자 그대로', () => {
    const { container } = render(
      <p>
        <RichLine text={'첫 줄\n**굵은 둘째** <b>x</b>'} />
      </p>,
    )
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.querySelector('strong')).toHaveTextContent('굵은 둘째')
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toBe('첫 줄\n굵은 둘째 <b>x</b>')
  })
})
