import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Sidebar } from '@/components/layout/Sidebar'
import { useFeatureStore } from '@/stores/featureStore'
import type { ActiveFeature } from '@/stores/featureStore'

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

const meta = (over: Partial<ActiveFeature> & { key: string }): ActiveFeature => ({
  name: over.key,
  menu_path: null,
  menu_icon: null,
  menu_label: null,
  menu_position: 99,
  is_beta: false,
  release_note: null,
  released_at: null,
  ...over,
})

describe('Sidebar 기능 게이팅', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  afterEach(() => useFeatureStore.getState().reset())

  it('loaded 전에는 게이팅 메뉴도 모두 노출된다 (graceful)', () => {
    renderSidebar()
    expect(screen.getByText('대시보드')).toBeInTheDocument()
    expect(screen.getByText('콘텐츠 편집')).toBeInTheDocument()
    expect(screen.getByText('방문자 분석')).toBeInTheDocument()
  })

  it('loaded 후 꺼진 기능 메뉴는 숨기고, always 메뉴는 유지', () => {
    useFeatureStore.setState({
      loaded: true,
      flags: { SECTION_EDITOR: true, SEO_WIZARD: true, TEMPLATE_SELECT: true },
      features: [],
    })
    renderSidebar()
    // NAVER_ANALYTICS 미배포 → 방문자 분석 숨김
    expect(screen.queryByText('방문자 분석')).not.toBeInTheDocument()
    // 콘텐츠 편집은 켜져 있으므로 노출
    expect(screen.getByText('콘텐츠 편집')).toBeInTheDocument()
    // 대시보드는 always
    expect(screen.getByText('대시보드')).toBeInTheDocument()
  })

  it('BETA 뱃지 노출', () => {
    useFeatureStore.setState({
      loaded: true,
      flags: { SEO_WIZARD: true },
      features: [meta({ key: 'SEO_WIZARD', is_beta: true })],
    })
    renderSidebar()
    expect(screen.getByText('BETA')).toBeInTheDocument()
  })

  it('NEW 뱃지 노출 (released_at 7일 이내)', () => {
    useFeatureStore.setState({
      loaded: true,
      flags: { TEMPLATE_SELECT: true },
      features: [
        meta({
          key: 'TEMPLATE_SELECT',
          released_at: new Date(Date.now() - 86400000).toISOString(),
        }),
      ],
    })
    renderSidebar()
    expect(screen.getByText('NEW')).toBeInTheDocument()
  })
})
