import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { CollapsedSidebar } from '@/components/layout/CollapsedSidebar'
import { breadcrumbsFor, isChildActive } from '@/components/layout/navigation'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useFeatureStore } from '@/stores/featureStore'

beforeEach(() => {
  useAppearanceStore.setState({ mode: 'light', collapsed: false })
  useFeatureStore.getState().reset()
  // jsdom has no native dialog implementation.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function renderHeader(path = '/admin/dashboard', onToggleMenu = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['billing', 'subscription'], null)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Header onToggleMenu={onToggleMenu} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('tenant admin appearance', () => {
  it('toggles theme and persists the preference', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: '다크 모드로 전환' }))
    expect(useAppearanceStore.getState().mode).toBe('dark')
    expect(JSON.parse(localStorage.getItem('cms-admin-appearance')!).state.mode).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: '라이트 모드로 전환' }))
    expect(useAppearanceStore.getState().mode).toBe('light')
  })

  it('calls the menu toggle', async () => {
    const toggle = vi.fn()
    renderHeader('/admin/dashboard', toggle)
    await userEvent.click(screen.getByRole('button', { name: '메뉴 접기/펴기' }))
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('searches visible menus and navigates from results', async () => {
    useFeatureStore.setState({ loaded: true, flags: { BOARD_MANAGER: true } })
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: '메뉴 검색' }))
    const dialog = screen.getByRole('dialog', { name: '메뉴 검색' })
    expect(within(dialog).queryByRole('link', { name: '방문자 분석' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: '검색어' }), '게시글 관리')
    await userEvent.click(within(dialog).getByRole('link', { name: '게시글 관리' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: '브레드크럼' })).getByText('게시글 관리')
    ).toHaveAttribute('aria-current', 'page')
  })

  it('shows an empty search result', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: '메뉴 검색' }))
    await userEvent.type(screen.getByRole('textbox', { name: '검색어' }), '없는메뉴')
    expect(screen.getByRole('status')).toHaveTextContent('검색 결과가 없습니다.')
  })

  it('changes and resets settings', async () => {
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: '화면 설정' }))
    await userEvent.click(screen.getByRole('button', { name: '아이콘 메뉴' }))
    await userEvent.click(screen.getByRole('button', { name: '다크 모드' }))
    expect(useAppearanceStore.getState()).toMatchObject({ collapsed: true, mode: 'dark' })
    await userEvent.click(screen.getByRole('button', { name: '기본 설정으로 초기화' }))
    expect(useAppearanceStore.getState()).toMatchObject({ collapsed: false, mode: 'light' })
  })

  it('opens grouped posts on hover and respects flags', async () => {
    useFeatureStore.setState({
      loaded: true,
      flags: { BOARD_MANAGER: true, AI_MONTHLY_REPORT: true },
    })
    render(
      <MemoryRouter>
        <CollapsedSidebar />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: '월간 리포트' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '게시글 관리' })).not.toBeInTheDocument()
    await userEvent.hover(screen.getByRole('link', { name: '게시판 관리' }))
    const flyout = screen.getByRole('navigation', { name: '게시판 관리 바로가기' })
    expect(within(flyout).getByRole('link', { name: '게시판 목록' })).toBeInTheDocument()
    await userEvent.hover(within(flyout).getByRole('link', { name: '게시글 관리' }))
    await userEvent.click(within(flyout).getByRole('link', { name: '게시글 관리' }))
    expect(
      screen.queryByRole('navigation', { name: '게시판 관리 바로가기' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '방문자 분석' })).not.toBeInTheDocument()
  })

  it('opens a label on focus and dismisses with Escape', async () => {
    render(
      <MemoryRouter>
        <CollapsedSidebar />
      </MemoryRouter>
    )
    await userEvent.tab()
    expect(screen.getByRole('navigation', { name: '대시보드 바로가기' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: '대시보드 바로가기' })).not.toBeInTheDocument()
  })

  it('게시판 생성 화면이면 메뉴에서 그것만 현재 화면으로 표시한다', () => {
    const children = [{ to: '/admin/boards' }, { to: '/admin/boards/new' }, { to: '/admin/posts' }]
    expect(isChildActive('/admin/boards/new', '/admin/boards/new', children)).toBe(true)
    expect(isChildActive('/admin/boards/new', '/admin/boards', children)).toBe(false)
    expect(isChildActive('/admin/boards/b1/settings', '/admin/boards', children)).toBe(true)
  })

  it.each([
    ['/admin/boards/b1/posts/new', ['게시판 관리', '게시글 목록', '글쓰기']],
    ['/admin/boards/b1/posts/p1/edit', ['게시판 관리', '게시글 목록', '게시글 수정']],
    ['/admin/boards/b1/settings', ['게시판 관리', '게시판 설정']],
    ['/admin/boards/b1/connection', ['게시판 관리', '홈페이지 연결']],
    ['/admin/boards/b1/fields', ['게시판 관리', '필드 관리']],
    ['/admin/boards/b1/design', ['게시판 관리', '게시판 디자인']],
    ['/admin/boards/b1/posts', ['게시판 관리', '게시글 목록']],
    ['/admin/boards/trash', ['게시판 관리', '휴지통']],
    ['/admin/content/section1', ['콘텐츠 편집', '섹션 편집']],
  ])('builds breadcrumbs for %s', (path, expected) => {
    expect(breadcrumbsFor(path).map(({ label }) => label)).toEqual(expected)
  })
})
