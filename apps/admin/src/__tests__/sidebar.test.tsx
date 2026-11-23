import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { Sidebar } from '@/components/layout/Sidebar'
import { useFeatureStore } from '@/stores/featureStore'
import type { ActiveFeature } from '@/stores/featureStore'

// 신고된 글 메뉴의 처리 안 한 신고 수 (T-229)
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))
beforeEach(() => get.mockResolvedValue({ data: { data: [] } }))

function renderSidebar(path = '/') {
  return renderWithQuery(
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
      flags: { AI_MONTHLY_REPORT: true },
      features: [meta({ key: 'AI_MONTHLY_REPORT', is_beta: true })],
    })
    renderSidebar()
    expect(screen.getByText('BETA')).toBeInTheDocument()
  })

  it('2뎁스 메뉴에도 뱃지 — 사이트 관리 → SEO 설정 (T-221)', () => {
    useFeatureStore.setState({
      loaded: true,
      flags: { SEO_WIZARD: true },
      features: [meta({ key: 'SEO_WIZARD', is_beta: true })],
    })
    renderSidebar('/admin/site/seo')
    expect(within(screen.getByRole('link', { name: /SEO 설정/ })).getByText('BETA')).toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: '게시글 관리' })).not.toBeInTheDocument()

    await userEvent.click(group())

    expect(group()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: '게시판 목록' })).toHaveAttribute('href', '/admin/boards')
    expect(screen.getByRole('link', { name: '게시글 관리' })).toHaveAttribute('href', '/admin/posts')
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
    ['/admin/boards/b1/posts', '게시글 관리'],
    // 게시판별 탭(설정 · 디자인 · 필드)은 게시판 목록 아래 (T-229)
    ['/admin/boards/b1/settings', '게시판 목록'],
    ['/admin/boards/b1/design', '게시판 목록'],
    ['/admin/boards/b1/fields', '게시판 목록'],
    ['/admin/posts/reports', '신고된 글'],
    ['/admin/boards/trash', '휴지통'],
    ['/admin/posts', '게시글 관리'],
  ])('%s 에서는 펼친 채 %s 표시', (path, label) => {
    renderSidebar(path)
    expect(group()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  it('하위 메뉴는 6개 — 게시판별 화면은 게시판을 고른 뒤 탭으로 (T-229)', () => {
    renderSidebar('/admin/boards')
    const list = screen.getByRole('link', { name: '게시판 목록' }).closest('ul')!
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual([
      '게시판 목록',
      '게시판 만들기',
      '게시글 관리',
      '신고된 글',
      '휴지통',
      '변경 기록',
    ])
  })

  it('처리 안 한 신고가 있으면 신고된 글 옆에 수를 보인다 (T-229)', async () => {
    get.mockResolvedValue({ data: { data: [{ post_id: 'p1' }, { post_id: 'p2' }] } })
    renderSidebar('/admin/boards')
    const reports = screen.getByRole('link', { name: /^신고된 글/ })
    await waitFor(() => expect(reports).toHaveTextContent('2건 처리 필요'))
    expect(get).toHaveBeenCalledWith('/v1/posts/reports')
  })

  it('하위 메뉴를 고르면 모바일 메뉴 닫기 호출', async () => {
    const onClose = vi.fn()
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards']}>
        <Sidebar onClose={onClose} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: '게시글 관리' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('기능이 꺼지면 메뉴째 숨긴다', () => {
    useFeatureStore.setState({ loaded: true, flags: {}, features: [] })
    renderSidebar('/admin/dashboard')
    expect(screen.queryByRole('button', { name: '게시판 관리' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).queryByText('게시판 목록')).not.toBeInTheDocument()
  })
})

describe('사이트 관리 2뎁스 메뉴 (T-221)', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  afterEach(() => useFeatureStore.getState().reset())

  const group = () => screen.getByRole('button', { name: '사이트 관리' })
  const SITE_MENU = [
    ['사이트 기본정보', '/admin/site/info'],
    ['메뉴 관리', '/admin/site/menu'],
    ['약관 · 정책 관리', '/admin/site/policies'],
    ['SEO 설정', '/admin/site/seo'],
    ['AEO 설정', '/admin/site/aeo'],
    ['GEO 설정', '/admin/site/geo'],
  ]

  it('대시보드 바로 아래에 있고, 하위 메뉴 6개를 기획 순서대로', async () => {
    renderSidebar('/admin/dashboard')
    const nav = screen.getByRole('navigation')
    // 문서 순서대로 찾는다
    const top = within(nav).getAllByText(/^(대시보드|사이트 관리|콘텐츠 편집)$/)
    expect(top.map((el) => el.textContent)).toEqual(['대시보드', '사이트 관리', '콘텐츠 편집'])

    await userEvent.click(group())
    const links = within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/admin/site/'))
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(SITE_MENU)
  })

  it('예전 단독 메뉴 SEO 설정 · 약관 · 방침은 없다', () => {
    renderSidebar('/admin/dashboard')
    expect(screen.queryByRole('link', { name: '약관 · 방침' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'SEO 설정' })).not.toBeInTheDocument()
  })

  it.each(SITE_MENU)('%s 화면에서는 펼친 채 표시', (label, path) => {
    renderSidebar(path)
    expect(group()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  it('SEO 기능이 꺼지면 검색 설정 3개만 숨긴다', () => {
    useFeatureStore.setState({ loaded: true, flags: {}, features: [] })
    renderSidebar('/admin/site/info')
    expect(screen.getByRole('link', { name: '사이트 기본정보' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '약관 · 정책 관리' })).toBeInTheDocument()
    for (const label of ['SEO 설정', 'AEO 설정', 'GEO 설정'])
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
  })
})
