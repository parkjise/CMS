import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { hiddenInThemeCount, themeHomeSections } from '@/lib/themeSections'
import { Navbar } from '@/components/layout/Navbar'
import { PreviewBanner } from '@/components/preview/PreviewBanner'
import type { PublicSection } from '@/lib/publicSite.types'

// 테마형 홈페이지 섹션 고르기 · 메뉴 · 미리보기 안내 (T-057-A)
// 코드형 템플릿용 내용(하위 페이지 · 메인 슬라이드)을 테마형으로 미리보면 메뉴가 30개로 넘치던 문제

afterEach(cleanup)

let n = 0
const sec = (
  section_type: string,
  over: Partial<PublicSection> = {},
): PublicSection => ({
  id: `s-${(n += 1)}`,
  section_type,
  label: `${section_type} ${n}`,
  display_order: n,
  is_active: true,
  settings: [],
  ...over,
})

describe('themeHomeSections', () => {
  it('홈 페이지 · 노출 · 그릴 수 있는 섹션만, 순서 유지', () => {
    const hero = sec('HERO_BANNER')
    const slider = sec('HERO_SLIDER')
    const about = sec('INTRO', { page_key: 'about' })
    const hidden = sec('GALLERY', { is_active: false })
    const intro = sec('INTRO', { page_key: 'home' })
    const legacy = sec('MAP', { page_key: undefined })
    const all = [hero, slider, about, hidden, intro, legacy]
    expect(themeHomeSections(all).map((s) => s.id)).toEqual([hero.id, intro.id, legacy.id])
    // 노출 중인데 안 보이는 것: 슬라이드 · 하위 페이지 소개 (숨김 섹션은 세지 않음)
    expect(hiddenInThemeCount(all)).toBe(2)
  })

  it('테마형 내용이면 숨는 섹션 없음', () => {
    const all = [sec('HERO_BANNER'), sec('GALLERY'), sec('CONTACT')]
    expect(themeHomeSections(all)).toHaveLength(3)
    expect(hiddenInThemeCount(all)).toBe(0)
  })
})

describe('Navbar', () => {
  it('메뉴 글자는 줄바꿈하지 않고, 넘치면 가로로 스크롤', () => {
    render(
      <Navbar
        tenantName="테스트 사업체"
        sections={Array.from({ length: 30 }, (_, i) => sec('INTRO', { label: `브랜드 이야기 ${i}` }))}
      />,
    )
    const nav = screen.getByRole('navigation', { name: '페이지 내 섹션' })
    expect(nav.querySelector('ul')?.className).toContain('overflow-x-auto')
    expect(screen.getByRole('button', { name: '브랜드 이야기 0' }).className).toContain(
      'whitespace-nowrap',
    )
    expect(screen.getByRole('button', { name: '테스트 사업체 홈으로 이동' }).className).toContain(
      'whitespace-nowrap',
    )
  })
})

describe('PreviewBanner', () => {
  it('보이지 않는 섹션이 있으면 안내', () => {
    render(<PreviewBanner templateName="펜션 감성" hiddenCount={27} />)
    expect(screen.getByTestId('preview-hidden-notice')).toHaveTextContent(
      '지금 내용 중 27개 섹션은 이 템플릿에서 보이지 않습니다',
    )
  })

  it('없으면 안내하지 않음', () => {
    render(<PreviewBanner templateName="펜션 감성" />)
    expect(screen.queryByTestId('preview-hidden-notice')).toBeNull()
  })
})
