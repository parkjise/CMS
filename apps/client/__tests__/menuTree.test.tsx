import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { PublicMenuNode } from '@cms/types'
import { Navbar } from '@/components/layout/Navbar'
import { menuLinks, mobileLinks } from '@/lib/menuTree'
import type { PublicSection, PublicSite } from '@/lib/publicSite.types'
import HospitalATemplate from '@/templates/hospital-a/Template'
import { hospitalASample } from '@/templates/hospital-a/sample-content'
import { resolveSiteInfo } from '@/templates/shared/resolveSections'

// 메뉴 관리 트리가 홈페이지 상단 메뉴로 (T-223)

afterEach(cleanup)

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

const node = (
  label: string,
  type: PublicMenuNode['type'],
  target: string | null,
  extra: Partial<PublicMenuNode> = {}
) =>
  ({ label, type, target, slug: null, new_window: false, children: [], ...extra }) as PublicMenuNode

const section = (id: string, label: string, extra: Partial<PublicSection> = {}) =>
  ({
    id,
    label,
    section_type: 'INTRO',
    display_order: 0,
    is_active: true,
    settings: [],
    ...extra,
  }) as PublicSection

describe('menuLinks', () => {
  const resolve = {
    page: (key: string) => (key === 'gone' ? null : { href: `/demo/${key}` }),
    board: (slug: string) => `/demo/b/${slug}`,
  }

  it('연결 유형마다 주소 · 새 창 · 하위 메뉴', () => {
    const links = menuLinks(
      [
        node('안내', 'group', null, {
          children: [
            node('소개', 'page', 'about'),
            node('블로그', 'url', 'https://blog.example.com', { new_window: true }),
            node('소식', 'board', 'b1', { slug: 'news' }),
          ],
        }),
      ],
      resolve
    )
    expect(links[0].href).toBeUndefined()
    expect(links[0].children.map((l) => [l.label, l.href, l.newWindow])).toEqual([
      ['소개', '/demo/about', false],
      ['블로그', 'https://blog.example.com', true],
      ['소식', '/demo/b/news', false],
    ])
  })

  it('갈 곳 없는 페이지는 빼고, 비게 된 묶음도 뺀다', () => {
    expect(
      menuLinks([node('묶음', 'group', null, { children: [node('x', 'page', 'gone')] })], resolve)
    ).toEqual([])
  })

  it('휴대폰 메뉴 — 휴대폰에서 숨긴 섹션과 비게 된 묶음은 뺀다', () => {
    const links = mobileLinks([
      {
        key: 'g',
        label: '묶음',
        newWindow: false,
        children: [
          {
            key: 's',
            label: 's',
            sectionId: 's',
            mobileHidden: true,
            newWindow: false,
            children: [],
          },
        ],
      },
      { key: 'a', label: 'a', href: '/a', newWindow: false, children: [] },
    ])
    expect(links.map((l) => l.label)).toEqual(['a'])
  })
})

describe('테마형 상단 메뉴 트리', () => {
  const tree: PublicMenuNode[] = [
    node('병원 안내', 'group', null, {
      children: [
        node('소개', 'page', 's1'),
        node('블로그', 'url', 'https://blog.example.com', { new_window: true }),
        node('진료', 'group', null, { children: [node('소식', 'board', 'b1', { slug: 'news' })] }),
      ],
    }),
    node('메인', 'page', 's2'),
  ]

  it('하위 메뉴를 드롭다운으로, 3단계는 들여쓰기로, 새 창은 안전한 속성으로', () => {
    render(
      <Navbar
        tenantName="OO"
        sections={[section('s1', '소개'), section('s2', '메인')]}
        menuTree={tree}
        menuItems={[{ key: 's2', label: '무시', visible: false }]}
        site={{ slug: 'demo', subPage: true }}
      />
    )
    const nav = screen.getByRole('navigation', { name: '페이지 내 섹션' })
    // 트리가 있으면 예전 메뉴 설정(menuItems)은 쓰지 않는다
    expect(within(nav).getByRole('link', { name: '메인' })).toHaveAttribute(
      'href',
      '/demo#section-s2'
    )
    expect(within(nav).getByRole('button', { name: '병원 안내' })).toHaveAttribute(
      'aria-haspopup',
      'true'
    )
    expect(within(nav).getByRole('link', { name: '소개' })).toHaveAttribute(
      'href',
      '/demo#section-s1'
    )
    const blog = within(nav).getByRole('link', { name: '블로그' })
    expect(blog).toHaveAttribute('target', '_blank')
    expect(blog).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(nav).getByRole('link', { name: '소식' })).toHaveAttribute('href', '/demo/b/news')
    // 메뉴가 잘리지 않게 가로 스크롤 대신 줄바꿈
    expect(nav.querySelector('ul')).toHaveClass('flex-wrap')
  })

  it('휴대폰 메뉴는 들여쓰기 목록', () => {
    render(
      <Navbar
        tenantName="OO"
        sections={[section('s1', '소개'), section('s2', '메인')]}
        menuTree={tree}
        site={{ slug: 'demo' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    const mobile = screen.getByRole('navigation', { name: '모바일 섹션 메뉴' })
    expect(within(mobile).getByText('병원 안내').tagName).toBe('SPAN')
    expect(within(mobile).getByRole('link', { name: '소식' })).toHaveClass('pl-14')
    // 메인 화면의 섹션은 주소 대신 내려가기 버튼
    expect(within(mobile).getByRole('button', { name: '소개' })).toHaveClass('pl-10')
  })

  it('없는 섹션 메뉴는 그리지 않는다', () => {
    render(
      <Navbar
        tenantName="OO"
        sections={[]}
        menuTree={[node('사라진 섹션', 'page', 'x')]}
        site={{ slug: 'demo' }}
      />
    )
    expect(screen.queryByText('사라진 섹션')).not.toBeInTheDocument()
  })
})

describe('코드형(hospital-a) 상단 메뉴 트리', () => {
  const site = {
    tenant: { id: 't', slug: 'demo', name: '데모 의원', template_type: 'HOSPITAL' },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template: null,
    site_settings: null,
  } as unknown as PublicSite

  const renderTemplate = (menuTree: PublicMenuNode[] | null) =>
    render(
      <HospitalATemplate
        site={site}
        tenantSlug="demo"
        pageKey="home"
        // 헤더만 본다 — 섹션(슬라이더 등)은 그리지 않는다
        sections={[]}
        siteInfo={resolveSiteInfo(hospitalASample, site)}
        preview={false}
        menuTree={menuTree}
        menuItems={[{ key: 'about', label: '예전 이름', visible: true }]}
      />
    )

  it('하위 메뉴 · 새 창 · 게시판 주소', () => {
    renderTemplate([
      node('회사소개', 'page', 'about', {
        children: [
          node('연혁', 'page', 'about-history'),
          node('블로그', 'url', 'https://blog.example.com', { new_window: true }),
        ],
      }),
      node('소식', 'board', 'b1', { slug: 'news' }),
      node('없는 페이지', 'page', 'nope'),
    ])
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    const about = within(nav).getByRole('link', { name: '회사소개' })
    expect(about).toHaveAttribute('href', '/demo/about')
    const parent = about.closest('li') as HTMLElement
    expect(parent).toHaveClass('header__menu-item--parent')
    expect(within(parent).getByRole('link', { name: '연혁' })).toHaveAttribute(
      'href',
      '/demo/about-history'
    )
    const blog = within(parent).getByRole('link', { name: /블로그/ })
    expect(blog).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(nav).getByRole('link', { name: '소식' })).toHaveAttribute('href', '/demo/b/news')
    expect(within(nav).queryByText('없는 페이지')).not.toBeInTheDocument()
    expect(within(nav).queryByText('예전 이름')).not.toBeInTheDocument()
  })

  it('묶음은 주소 없는 버튼', () => {
    renderTemplate([
      node('안내', 'group', null, { children: [node('연혁', 'page', 'about-history')] }),
    ])
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByRole('button', { name: '안내' })).toHaveClass('header__menu-group')
  })

  it('트리가 없으면 예전 메뉴 설정 그대로', () => {
    renderTemplate(null)
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByRole('link', { name: '예전 이름' })).toHaveAttribute(
      'href',
      '/demo/about'
    )
    expect(nav.querySelector('.header__submenu')).toBeNull()
  })
})
