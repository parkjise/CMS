import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Navbar } from '@/components/layout/Navbar'
import { applyMenu } from '@/lib/menuSettings'
import type { PublicSection } from '@/lib/publicSite.types'
import { hospitalAManifest } from '@/templates/hospital-a/manifest'

// 상단 메뉴 설정 (T-036-B)

const items = [
  { key: 'a', label: '소개' },
  { key: 'b', label: '서비스' },
  { key: 'c', label: '문의' },
]

describe('applyMenu', () => {
  it('저장값이 없으면 기본 메뉴 그대로', () => {
    expect(applyMenu(items, null, true)).toEqual(items)
    expect(applyMenu(items, [], false)).toEqual(items)
  })

  it('이름 바꾸기 · 숨기기, 빈 이름은 기본 이름', () => {
    const out = applyMenu(
      items,
      [
        { key: 'a', label: '  병원 소개 ', visible: true },
        { key: 'b', label: null, visible: false },
        { key: 'c', label: '   ', visible: true },
      ],
      false,
    )
    expect(out.map((i) => i.label)).toEqual(['병원 소개', '문의'])
  })

  it('reorderable 이면 저장 순서대로, 저장값에 없는 새 메뉴는 기본 순서로 뒤에', () => {
    const out = applyMenu(
      [...items, { key: 'd', label: '새 메뉴' }],
      [
        { key: 'c', label: null, visible: true },
        { key: 'a', label: null, visible: true },
      ],
      true,
    )
    expect(out.map((i) => i.key)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('reorderable 이 아니면 저장 순서를 무시한다 (테마형 — 섹션 순서)', () => {
    const out = applyMenu(items, [{ key: 'c', label: null, visible: true }], false)
    expect(out.map((i) => i.key)).toEqual(['a', 'b', 'c'])
  })
})

const section = (id: string, label: string): PublicSection => ({
  id,
  section_type: 'INTRO',
  label,
  display_order: 0,
  is_active: true,
  settings: [],
})

describe('테마형 상단 메뉴', () => {
  it('바꾼 이름 · 숨긴 메뉴가 PC · 휴대폰 메뉴에 반영된다', () => {
    render(
      <Navbar
        tenantName="OO의원"
        sections={[section('s1', '소개'), section('s2', '갤러리'), section('s3', '문의')]}
        menuItems={[
          { key: 's1', label: '병원 소개', visible: true },
          { key: 's2', label: null, visible: false },
        ]}
      />,
    )
    const desktop = screen.getByRole('navigation', { name: '페이지 내 섹션' })
    expect(within(desktop).getAllByRole('button').map((b) => b.textContent)).toEqual(['병원 소개', '문의'])
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    expect(screen.getAllByRole('button', { name: '병원 소개' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '갤러리' })).not.toBeInTheDocument()
  })
})

describe('테마형 상단 메뉴 — 새 게시판 (T-141)', () => {
  const boards = [
    { id: 'b1', name: '병원 소식', slug: 'news', description: '', board_type: 'LIST' as const },
    { id: 'b2', name: '사진첩', slug: 'photos', description: '', board_type: 'GALLERY' as const },
  ]
  const desktop = () => screen.getByRole('navigation', { name: '페이지 내 섹션' })

  it('메인: 섹션은 스크롤 버튼, 게시판은 섹션 뒤에 링크', () => {
    render(<Navbar tenantName="OO" sections={[section('s1', '소개')]} site={{ slug: 'demo', boards }} />)
    expect(within(desktop()).getByRole('button', { name: '소개' })).toBeInTheDocument()
    expect(within(desktop()).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/demo/b/news',
      '/demo/b/photos',
    ])
    expect(within(desktop()).getAllByRole('listitem')[0]).toHaveTextContent('소개')
  })

  it('이름 · 숨기기 설정이 반영된다', () => {
    render(
      <Navbar
        tenantName="OO"
        sections={[]}
        site={{ slug: 'demo', boards }}
        menuItems={[
          { key: 'board:b1', label: '새 소식', visible: true },
          { key: 'board:b2', label: null, visible: false },
        ]}
      />,
    )
    expect(within(desktop()).getAllByRole('link').map((a) => a.textContent)).toEqual(['새 소식'])
  })

  it('게시판 화면: 섹션 메뉴 · 로고는 메인으로 가는 링크', () => {
    render(
      <Navbar tenantName="OO" sections={[section('s1', '소개')]} site={{ slug: 'demo', boards, subPage: true }} />,
    )
    expect(within(desktop()).getByRole('link', { name: '소개' })).toHaveAttribute('href', '/demo#section-s1')
    expect(screen.getByRole('link', { name: 'OO 홈으로 이동' })).toHaveAttribute('href', '/demo')
  })

  it('고객 도메인이면 주소에 slug 가 없다', () => {
    vi.stubGlobal('location', { ...window.location, hostname: 'www.oo.com', hash: '' })
    render(
      <Navbar tenantName="OO" sections={[section('s1', '소개')]} site={{ slug: 'demo', boards, subPage: true }} />,
    )
    expect(within(desktop()).getByRole('link', { name: '소개' })).toHaveAttribute('href', '/#section-s1')
    expect(within(desktop()).getByRole('link', { name: '병원 소식' })).toHaveAttribute('href', '/b/news')
    expect(screen.getByRole('link', { name: 'OO 홈으로 이동' })).toHaveAttribute('href', '/')
    vi.unstubAllGlobals()
  })

  it('메인에 #section- 으로 들어오면 그 섹션으로 내려간다', () => {
    const target = document.createElement('div')
    target.dataset.sectionId = 's1'
    target.scrollIntoView = vi.fn()
    document.body.append(target)
    window.location.hash = '#section-s1'
    render(<Navbar tenantName="OO" sections={[section('s1', '소개')]} site={{ slug: 'demo' }} />)
    expect(target.scrollIntoView).toHaveBeenCalled()
    window.location.hash = ''
    target.remove()
  })

  it('휴대폰 메뉴에도 게시판이 있다', () => {
    render(<Navbar tenantName="OO" sections={[]} site={{ slug: 'demo', boards }} />)
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    const mobile = screen.getByRole('navigation', { name: '모바일 섹션 메뉴' })
    expect(within(mobile).getByRole('link', { name: '사진첩' })).toHaveAttribute('href', '/demo/b/photos')
  })
})

describe('코드형 메뉴 기본값 동기화', () => {
  it('백엔드 메뉴 파일(TPL_HOSPITAL_A.menu.json)이 매니페스트 gnb 페이지와 같다', () => {
    const file = join(__dirname, '../../backend/app/data/templates/TPL_HOSPITAL_A.menu.json')
    const backend = JSON.parse(readFileSync(file, 'utf8')) as { key: string; title: string }[]
    const gnb = hospitalAManifest.pages
      .filter((p) => p.menu === 'gnb')
      .map((p) => ({ key: p.key, title: p.title }))
    expect(backend).toEqual(gnb)
  })
})
