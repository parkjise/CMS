import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PublicSite } from '@/lib/publicSite.types'
import { hospitalAManifest } from '@/templates/hospital-a/manifest'
import { hospitalASample } from '@/templates/hospital-a/sample-content'
import { resolvePageSections, resolveSiteInfo } from '@/templates/shared/resolveSections'
import type { ResolvedSection } from '@/templates/shared/contracts'

// 슬라이드·애니메이션 라이브러리는 화면 구조 검증과 무관 → 가짜로 대체
vi.mock('swiper', () => ({
  default: class {
    destroy = vi.fn()
    autoplay = { running: true, start: vi.fn(), stop: vi.fn() }
  },
}))
vi.mock('swiper/modules', () => ({ A11y: {}, Autoplay: {}, Navigation: {}, Pagination: {} }))
vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn(),
    registerPlugin: vi.fn(),
    context: (fn: () => void) => {
      fn()
      return { revert: vi.fn() }
    },
  },
}))
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }))
vi.mock('@/lib/api', () => ({ publicApi: { post: vi.fn().mockResolvedValue({}) } }))
vi.mock('@/lib/recaptcha', () => ({ executeRecaptcha: vi.fn().mockResolvedValue(null) }))

import HospitalATemplate from '@/templates/hospital-a/Template'
import { HeroSlider } from '@/templates/hospital-a/components/sections/HeroSlider'
import { VideoPlaylist } from '@/templates/hospital-a/components/sections/VideoPlaylist'
import { NoticeLatest } from '@/templates/hospital-a/components/sections/NoticeLatest'
import { Header } from '@/templates/hospital-a/components/Header'
import { QuickMenu } from '@/templates/hospital-a/components/QuickMenu'
import { publicApi } from '@/lib/api'

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
  tenant: {
    id: 't-1',
    slug: 'demo',
    name: '데모 의원',
    template_type: 'HOSPITAL',
    plan_type: 'BASIC',
    custom_domain: null,
  },
  sections: [],
  seo_settings: null,
  sns_settings: null,
  template: null,
}

const sections = resolvePageSections(hospitalAManifest, hospitalASample, [], 'home')
const byType = (type: string) => sections.find((s) => s.section.section_type === type) as ResolvedSection

describe('hospital-a 매니페스트 · 샘플 (T-121)', () => {
  it('코드형 SCSS 템플릿이고 메인 섹션 5종을 순서대로 그린다', () => {
    expect(hospitalAManifest.renderer).toBe('code')
    expect(hospitalAManifest.styling).toBe('scss')
    expect(sections.map((s) => s.section.section_type)).toEqual([
      'HERO_SLIDER',
      'INTRO',
      'SERVICES',
      'VIDEO_PLAYLIST',
      'NOTICE_LATEST',
    ])
  })

  it('샘플 이미지는 공용 경로 /templates/{key}/{version}/ 를 쓴다', () => {
    const json = JSON.stringify(hospitalASample)
    const urls = json.match(/\/templates\/[^"]+\.(jpg|png|svg|avif|webp)/g) ?? []
    expect(urls.length).toBeGreaterThan(10)
    for (const url of urls) {
      expect(url.startsWith(`/templates/${hospitalAManifest.key}/${hospitalAManifest.version}/`)).toBe(true)
    }
  })

  it('샘플 JSON 의 섹션 타입은 모두 매니페스트가 지원한다 (T-120)', () => {
    for (const sections of Object.values(hospitalASample.pages)) {
      for (const s of sections) {
        expect(hospitalAManifest.sections).toContain(s.section_type)
        expect(s.label).toBeTruthy()
      }
    }
    expect(hospitalASample.version).toBe(hospitalAManifest.version)
  })

  it('매니페스트 css_variables 에 화면 폭별 간격 토큰을 넣지 않는다 (미디어쿼리 덮어쓰기 방지)', () => {
    const keys = Object.keys(hospitalAManifest.css_variables)
    expect(keys.some((k) => k.startsWith('spacing'))).toBe(false)
  })
})

describe('hospital-a 화면 (T-121)', () => {
  it('템플릿 루트: 헤더 메뉴 · 메인 · 푸터 · 퀵메뉴를 그린다', () => {
    const info = resolveSiteInfo(hospitalASample, site)
    render(
      <HospitalATemplate
        site={site}
        tenantSlug="demo"
        pageKey="home"
        sections={sections}
        siteInfo={info}
        preview={false}
      />,
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/demo/about',
      '/demo/business',
      '/demo/notice',
      '/demo/consult',
    ])
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/demo/member/login')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    // 상호는 테넌트 이름
    expect(screen.getAllByText('데모 의원').length).toBeGreaterThan(0)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('02-1234-5678')
    expect(screen.getByRole('complementary', { name: '빠른 메뉴' })).toBeInTheDocument()
  })

  it('히어로: 슬라이드 수만큼 그리고 현재 슬라이드 카피만 보인다', () => {
    const { container } = render(<HeroSlider {...byType('HERO_SLIDER')} tenantSlug="demo" />)
    expect(container.querySelectorAll('.hero-slider__slide')).toHaveLength(3)
    const panels = container.querySelectorAll('.hero-slider__content')
    expect(panels).toHaveLength(3)
    expect([...panels].filter((p) => !(p as HTMLElement).hidden)).toHaveLength(1)
    expect(screen.getByText('당신의 하루에 알맞은 온도')).toBeVisible()
    expect(screen.getByRole('button', { name: '자동 재생 정지' })).toBeInTheDocument()
  })

  it('영상: 목록을 누르면 대표 영상이 바뀌고, 재생을 눌러야 iframe 을 불러온다', () => {
    const { container } = render(<VideoPlaylist {...byType('VIDEO_PLAYLIST')} tenantSlug="demo" />)
    expect(container.querySelector('iframe')).toBeNull()
    const links = container.querySelectorAll('.video-playlist__link')
    fireEvent.click(links[2])
    expect(links[2]).toHaveAttribute('aria-current', 'true')
    expect(links[0]).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: /영상 재생/ }))
    const iframe = container.querySelector('iframe')
    expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube-nocookie.com/embed/VIDEO_ID_3'))
    expect(iframe).toHaveAttribute('title', expect.stringContaining('3분 만에'))
  })

  it('공지: 날짜를 점 형식으로 보여주고 목록 페이지로 연결한다', () => {
    render(<NoticeLatest {...byType('NOTICE_LATEST')} tenantSlug="demo" listHref="/demo/notice" />)
    expect(screen.getByText('2026.10.20')).toHaveAttribute('dateTime', '2026-10-20')
    expect(screen.getByRole('link', { name: /VIEW MORE/ })).toHaveAttribute('href', '/demo/notice')
  })

  it('헤더: 메뉴 버튼으로 열고 Esc 로 닫는다', () => {
    render(
      <Header
        brandName="데모"
        logoUrl="/logo.svg"
        homeHref="/demo"
        menu={[{ href: '/demo/about', title: '회사소개' }]}
        account={[]}
        tenantSlug="demo"
      />,
    )
    const toggle = screen.getByRole('button', { name: '전체 메뉴 열기' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toHaveClass('header__nav--open')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: '전체 메뉴 열기' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('간편상담: 필수값 안내 후, 올바르게 입력하면 문의 API 로 접수한다', async () => {
    render(<QuickMenu tenantSlug="demo" links={[]} phone="02-1234-5678" locationHref="/demo/about-location" />)
    fireEvent.click(screen.getAllByRole('button', { name: /간편상담/ })[0])
    const submit = screen.getByRole('button', { name: '신청하기' })
    fireEvent.click(submit)
    expect(await screen.findByText('필수 항목을 입력해주세요.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/이름을 입력해주세요/), { target: { value: '홍길동' } })
    fireEvent.change(screen.getByLabelText(/연락처를 입력해주세요/), { target: { value: '010-1234-5678' } })
    fireEvent.change(screen.getByLabelText('상담 분야'), { target: { value: '예약 · 일정' } })
    fireEvent.click(screen.getByLabelText(/상담 연락 수신 동의/))
    fireEvent.click(screen.getByLabelText(/개인정보 수집 및 이용 동의/))
    fireEvent.click(submit)

    expect(await screen.findByText(/상담 신청이 접수되었습니다/)).toBeInTheDocument()
    expect(publicApi.post).toHaveBeenCalledWith(
      '/inquiries',
      expect.objectContaining({ name: '홍길동', phone: '010-1234-5678', inquiry_type: 'GENERAL' }),
      { params: { tenant_slug: 'demo' } },
    )
  })
})
