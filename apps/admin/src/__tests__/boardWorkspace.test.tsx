import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardDesignPreview } from '@/components/boards/BoardDesignPreview'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { isChildActive, ADMIN_NAVIGATION } from '@/components/layout/navigation'
import { BOARD_CONTEXT_KEY } from '@/lib/boardWorkspace'
import { BoardsPage } from '@/pages/BoardsPage'
import { BoardWorkspacePage } from '@/pages/BoardWorkspacePage'
import { useAuthStore } from '@/stores/authStore'

const { get, del } = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get, delete: del } }))

const board = (over: Partial<Board>): Board =>
  ({
    id: 'b1',
    name: '공지사항',
    slug: 'notice',
    description: '',
    board_type: 'LIST',
    status: 'ACTIVE',
    system_key: 'notice',
    post_count: 2,
    has_samples: false,
    deleted_at: null,
    updated_at: '2026-11-05T00:00:00Z',
    sort_order: 'LATEST',
    page_size: null,
    design: {
      columns: 3,
      image_ratio: '4:3',
      show_date: true,
      show_image: true,
      show_summary: true,
      faq_single_open: false,
      faq_first_open: false,
    },
    ...over,
  }) as Board

const notice = board({})
const news = board({ id: 'b2', name: '소식', slug: 'news', system_key: null, post_count: 5 })
const jobs = board({ id: 'b3', name: '채용', slug: 'jobs', system_key: null, status: 'INACTIVE' })

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockBoards = (boards: Board[]) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url === '/v1/boards/limits') {
      return ok({
        plan: 'STANDARD',
        limit: 50,
        used: boards.length,
        can_create: true,
        reason: null,
      })
    }
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code', items: [] })
    return ok([])
  })

const Where = () => <p>이동: {useLocation().pathname}</p>

const renderWorkspace = (path: string) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/boards/:section" element={<BoardWorkspacePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  useAuthStore.setState({
    user: { role: 'TENANT_ADMIN' },
    tenantSlug: 'clinic',
  } as unknown as Parameters<typeof useAuthStore.setState>[0])
})

describe('게시판 관리 하위 메뉴 (T-187)', () => {
  it('마지막으로 작업한 게시판의 그 화면으로 보낸다', async () => {
    mockBoards([notice, news, jobs])
    sessionStorage.setItem(BOARD_CONTEXT_KEY, 'b3')
    renderWorkspace('/admin/boards/design')
    expect(await screen.findByText('이동: /admin/boards/b3/design')).toBeInTheDocument()
  })

  it('기억한 게시판이 없으면 첫 게시판, 기본 게시판에 없는 화면은 새 게시판으로', async () => {
    mockBoards([notice, news])
    renderWorkspace('/admin/boards/settings')
    expect(await screen.findByText('이동: /admin/boards/b1/settings')).toBeInTheDocument()
  })

  it('필드 관리는 기본 게시판을 건너뛴다', async () => {
    mockBoards([notice, news])
    sessionStorage.setItem(BOARD_CONTEXT_KEY, 'b1')
    renderWorkspace('/admin/boards/fields')
    expect(await screen.findByText('이동: /admin/boards/b2/fields')).toBeInTheDocument()
  })

  it('고를 게시판이 없으면 안내한다', async () => {
    mockBoards([notice])
    renderWorkspace('/admin/boards/categories')
    expect(await screen.findByText('설정할 게시판이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('이 설정은 새로 만든 게시판에서 쓸 수 있어요.')).toBeInTheDocument()
  })

  it('게시판별 화면은 그 화면을 여는 하위 메뉴를 켠다', () => {
    const children = ADMIN_NAVIGATION.find((item) => item.to === '/admin/boards')?.children ?? []
    const active = (path: string) =>
      children.filter(({ to }) => isChildActive(path, to, children)).map(({ label }) => label)
    expect(active('/admin/boards/b1/posts/p1/edit')).toEqual(['게시글 관리'])
    expect(active('/admin/boards/b1/operation')).toEqual(['환경설정'])
    expect(active('/admin/boards/b1/fields')).toEqual(['필드 관리'])
    expect(active('/admin/boards/design')).toEqual(['게시판 디자인'])
    expect(active('/admin/boards')).toEqual(['게시판 목록'])
  })
})

describe('제목 도움말 (T-187)', () => {
  afterEach(() => vi.useRealTimers())

  const renderTitle = () =>
    renderWithQuery(
      <MemoryRouter>
        <BoardPageTitle title="게시판 목록" description="게시판을 관리하세요." />
      </MemoryRouter>
    )

  it('처음 10초 동안 설명을 보여 주고 사라진다', () => {
    vi.useFakeTimers()
    renderTitle()
    expect(screen.getByRole('tooltip')).toHaveTextContent('게시판을 관리하세요.')
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('포커스하면 다시 보이고 Escape 로 닫힌다', async () => {
    renderTitle()
    const button = screen.getByRole('button', { name: '게시판 목록 도움말' })
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.blur(button)
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
  })
})

describe('게시판 목록 시안 (T-187)', () => {
  const renderList = () =>
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards']}>
        <Routes>
          <Route path="/admin/boards" element={<BoardsPage />} />
        </Routes>
      </MemoryRouter>
    )

  it('요약 카드와 상태 탭 숫자를 보여 준다', async () => {
    mockBoards([notice, news, jobs])
    renderList()
    await screen.findByRole('link', { name: '소식 글 5개' })
    expect(screen.getByText('전체 게시글').parentElement).toHaveTextContent('9개')
    const tabs = within(screen.getByRole('group', { name: '사용 상태' }))
    expect(tabs.getByRole('button', { name: /^운영 중/ })).toHaveTextContent('2')
    expect(tabs.getByRole('button', { name: /^비활성/ })).toHaveTextContent('1')
  })

  it('10개씩 나눠 보여 준다', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      board({ id: `n${index}`, name: `게시판 ${index + 1}`, slug: `b-${index}`, system_key: null })
    )
    mockBoards(many)
    renderList()
    await screen.findByRole('link', { name: '게시판 1 글 2개' })
    expect(screen.queryByRole('link', { name: '게시판 11 글 2개' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(screen.getByRole('link', { name: '게시판 11 글 2개' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('고른 새 게시판을 한꺼번에 휴지통으로 옮긴다 — 기본 게시판은 고를 수 없다', async () => {
    mockBoards([notice, news, jobs])
    del.mockResolvedValue({})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderList()
    await screen.findByRole('link', { name: '소식 글 5개' })
    expect(screen.queryByRole('checkbox', { name: '공지사항 선택' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: '이 페이지의 게시판 모두 선택' }))
    expect(screen.getByText('2개 선택')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '휴지통 이동' }))
    await waitFor(() => expect(del).toHaveBeenCalledTimes(2))
    expect(del.mock.calls.map(([url]) => url)).toEqual(['/v1/boards/b2', '/v1/boards/b3'])
  })
})

describe('디자인 미리보기 (T-187)', () => {
  it('기기를 바꾸면 그 너비로, 저장 전 설정을 바로 그린다', async () => {
    renderWithQuery(
      <BoardDesignPreview name="소식" type="LIST" design={{ ...news.design, show_date: false }} />
    )
    expect(screen.getByRole('heading', { name: '소식' })).toBeInTheDocument()
    expect(screen.queryByText('2026.11.11')).not.toBeInTheDocument()
    const mobile = screen.getByRole('button', { name: '모바일 미리보기' })
    await userEvent.click(mobile)
    expect(mobile).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PC 미리보기' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})
