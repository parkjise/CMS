import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MobileHideMarker } from '@/components/MobileHideMarker'
import { Navbar } from '@/components/layout/Navbar'
import { HeroBanner } from '@/components/sections/HeroBanner'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { useEditStore } from '@/lib/editStore'
import { isMobileHidden, mobileImage } from '@/lib/mobileSettings'
import type { PublicSection } from '@/lib/publicSite.types'
import { ResponsiveImg } from '@/templates/shared/ResponsiveImg'

// 섹션 모바일 설정 — 휴대폰에서 숨기기 · 휴대폰용 배경 (T-037-D)

const setting = (field_key: string, field_value: string) => ({
  field_key,
  field_value,
  value_type: 'STRING',
})

const section = (id: string, label: string, settings: Record<string, string> = {}): PublicSection => ({
  id,
  section_type: 'HERO_BANNER',
  label,
  display_order: 0,
  is_active: true,
  settings: Object.entries(settings).map(([k, v]) => setting(k, v)),
})

afterEach(() => useEditStore.setState({ isEditMode: false, isPreview: false }))

describe('모바일 설정 읽기', () => {
  it('mobile_hidden 이 "true" 일 때만 숨김, 휴대폰용 이미지는 없으면 빈 값', () => {
    expect(isMobileHidden(section('a', 'A', { mobile_hidden: 'true' }))).toBe(true)
    expect(isMobileHidden(section('a', 'A', { mobile_hidden: 'false' }))).toBe(false)
    expect(isMobileHidden(section('a', 'A'))).toBe(false)
    expect(mobileImage(section('a', 'A', { mobile_image_url: '/m.webp' }))).toBe('/m.webp')
    expect(mobileImage(section('a', 'A'))).toBe('')
  })
})

describe('테마형', () => {
  it('숨긴 섹션 감싸개에 data-mobile-hidden, 편집 모드에서는 배지', () => {
    const { container, rerender } = render(
      <SectionRenderer section={section('s1', '메인', { mobile_hidden: 'true', main_title: '안녕' })} tenantSlug="demo" />,
    )
    expect(container.querySelector('[data-section-wrapper="s1"]')).toHaveAttribute('data-mobile-hidden', 'true')
    expect(screen.queryByText('📱 휴대폰에서 숨김')).not.toBeInTheDocument()

    useEditStore.setState({ isEditMode: true, isPreview: false })
    rerender(<SectionRenderer section={section('s1', '메인', { mobile_hidden: 'true', main_title: '안녕' })} tenantSlug="demo" />)
    expect(screen.getByText('📱 휴대폰에서 숨김')).toBeInTheDocument()
  })

  it('보이는 섹션에는 표시가 없다', () => {
    const { container } = render(<SectionRenderer section={section('s2', '메인', { main_title: '안녕' })} tenantSlug="demo" />)
    expect(container.querySelector('[data-section-wrapper="s2"]')).not.toHaveAttribute('data-mobile-hidden')
  })

  it('휴대폰 메뉴에는 휴대폰에서 숨긴 섹션을 넣지 않는다 (PC 메뉴에는 그대로)', () => {
    render(
      <Navbar
        tenantName="OO의원"
        sections={[section('a', '소개'), section('b', '갤러리', { mobile_hidden: 'true' })]}
      />,
    )
    const desktop = screen.getByRole('navigation', { name: '페이지 내 섹션' })
    expect(within(desktop).getByRole('button', { name: '갤러리' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }))
    const menus = screen.getAllByRole('button', { name: '갤러리' })
    // PC 메뉴 1개만 — 휴대폰 메뉴에는 없음
    expect(menus).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '소개' })).toHaveLength(2)
  })

  it('메인 배너: 휴대폰용 배경이 있으면 휴대폰 변수에, 없으면 PC 이미지로', () => {
    const { container, rerender } = render(
      <HeroBanner section={section('h', '메인', { bg_image_url: '/pc.webp', mobile_image_url: '/m.webp' })} tenantSlug="demo" />,
    )
    const el = container.querySelector('section') as HTMLElement
    expect(el.style.getPropertyValue('--hero-bg')).toContain('/pc.webp')
    expect(el.style.getPropertyValue('--hero-bg-mobile')).toContain('/m.webp')
    rerender(<HeroBanner section={section('h', '메인', { bg_image_url: '/pc.webp' })} tenantSlug="demo" />)
    expect(el.style.getPropertyValue('--hero-bg-mobile')).toContain('/pc.webp')
  })
})

describe('코드형', () => {
  it('표식은 평소엔 보이지 않는 span, 편집 모드에서는 빠진다', () => {
    const { container, rerender } = render(<MobileHideMarker />)
    const marker = container.querySelector('[data-mobile-hide]')
    expect(marker).toHaveAttribute('hidden')
    useEditStore.setState({ isEditMode: true, isPreview: false })
    rerender(<MobileHideMarker />)
    expect(container.querySelector('[data-mobile-hide]')).toBeNull()
  })

  it('ResponsiveImg: 휴대폰용 사진이 있으면 picture + 휴대폰 source, 없으면 img 만', () => {
    const { container, rerender } = render(
      <ResponsiveImg className="sub-hero__image" src="/pc.jpg" mobileSrc="/m.jpg" sizes="100vw" />,
    )
    const source = container.querySelector('picture > source')
    expect(source).toHaveAttribute('media', '(max-width: 767px)')
    expect(source?.getAttribute('srcset')).toContain(encodeURIComponent('/m.jpg'))
    expect(container.querySelector('picture > img.sub-hero__image')).toBeInTheDocument()

    rerender(<ResponsiveImg className="sub-hero__image" src="/pc.jpg" sizes="100vw" />)
    expect(container.querySelector('picture')).toBeNull()
    expect(container.querySelector('img.sub-hero__image')).toBeInTheDocument()
  })
})
