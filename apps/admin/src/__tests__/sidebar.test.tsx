import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Sidebar } from '@/components/layout/Sidebar'
import { useFeatureStore } from '@/stores/featureStore'
import type { ActiveFeature } from '@/stores/featureStore'

function renderSidebar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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

describe('게시판 관리 2뎁스 메뉴', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  afterEach(() => useFeatureStore.getState().reset())

  const group = () => screen.getByRole('button', { name: '게시판 관리' })

  it('다른 화면에서는 접혀 있고, 누르면 하위 메뉴가 나온다 (누르기만 해서는 이동하지 않음)', async () => {
    renderSidebar('/admin/dashboard')
    expect(group()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: '전체 글' })).not.toBeInTheDocument()

    await userEvent.click(group())

    expect(group()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: '게시판 목록' })).toHaveAttribute('href', '/admin/boards')
    expect(screen.getByRole('link', { name: '전체 글' })).toHaveAttribute('href', '/admin/posts')
    // 지금 화면은 그대로
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute('aria-current', 'page')
  })

  it('다시 누르면 접힌다', async () => {
    renderSidebar('/admin/boards')
    await userEvent.click(group())
    expect(group()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: '게시판 목록' })).not.toBeInTheDocument()
  })

  it.each([
    ['/admin/boards', '게시판 목록'],
    ['/admin/boards/b1/posts', '게시판 목록'],
    ['/admin/boards/b1/settings', '게시판 목록'],
    ['/admin/boards/trash', '게시판 목록'],
    ['/admin/posts', '전체 글'],
  ])('%s 에서는 펼친 채 %s 표시', (path, label) => {
    renderSidebar(path)
    expect(group()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  it('하위 메뉴를 고르면 모바일 메뉴 닫기 호출', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter initialEntries={['/admin/boards']}>
        <Sidebar onClose={onClose} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: '전체 글' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('기능이 꺼지면 메뉴째 숨긴다', () => {
    useFeatureStore.setState({ loaded: true, flags: {}, features: [] })
    renderSidebar('/admin/dashboard')
    expect(screen.queryByRole('button', { name: '게시판 관리' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).queryByText('게시판 목록')).not.toBeInTheDocument()
  })
})
