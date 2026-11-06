import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import type { Board, BoardLimits } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardsPage } from '@/pages/BoardsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, post, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  updated_at: '2026-11-05T00:00:00Z',
  id: 'b1',
  name: '병원 소식',
  slug: 'board-1',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  post_count: 2,
  has_samples: false,
  deleted_at: null,
  sort_order: 'LATEST',
  page_size: null,
  seo_title: '',
  seo_description: '',
  seo_index: true,
  design: {
    columns: 3,
    image_ratio: '4:3',
    show_date: true,
    show_image: true,
    show_summary: true,
    faq_single_open: false,
    faq_first_open: false,
  },
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
}
const notice: Board = { ...board, id: 'n1', name: '공지사항', slug: 'notice', system_key: 'notice' }

const openLimits: BoardLimits = {
  plan: 'STANDARD',
  limit: 5,
  used: 1,
  can_create: true,
  reason: null,
}
const closedLimits: BoardLimits = {
  plan: 'BASIC',
  limit: 0,
  used: 0,
  can_create: false,
  reason: '게시판 추가는 STANDARD 요금제부터 쓸 수 있습니다.',
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = ({
  boards = [board],
  limits = openLimits,
  trash = [],
  mode = 'code',
}: {
  boards?: Board[]
  limits?: BoardLimits
  trash?: Board[]
  mode?: 'code' | 'theme'
}) => {
  get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) => {
    if (url === '/v1/boards/limits') return ok(limits)
    if (url === '/v1/boards') return ok(config?.params?.trash ? trash : boards)
    if (url === '/v1/site-settings/menu')
      return ok({ mode, reorderable: mode === 'code', items: [] })
    return ok(undefined)
  })
}

const Where = () => <p>이동한 화면</p>

const renderAt = (path: string, page: React.ReactElement, route: string) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={page} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role } } as unknown as Parameters<
    typeof useAuthStore.setState
  >[0])

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

afterEach(() => vi.restoreAllMocks())

describe('게시판 목록 작업 (T-156)', () => {
  const renderList = (path = '/admin/boards') => renderAt(path, <BoardsPage />, '/admin/boards')

  it('원본 ID로 복제하고 복사본 설정 화면으로 이동한다', async () => {
    mockApi({})
    post.mockResolvedValue({ data: { data: { ...board, id: 'copy-id' } } })
    const Target = () => <p>복사본 설정: {useParams().boardId}</p>
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards']}>
        <Routes>
          <Route path="/admin/boards" element={<BoardsPage />} />
          <Route path="/admin/boards/:boardId/settings" element={<Target />} />
        </Routes>
      </MemoryRouter>
    )
    await userEvent.click(await screen.findByRole('button', { name: '병원 소식 복제' }))
    expect(post).toHaveBeenCalledWith('/v1/boards/b1/duplicate')
    expect(await screen.findByText('복사본 설정: copy-id')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('설정과 칸을 복제했습니다. 글은 복제되지 않습니다.')
  })

  it('기본 게시판은 복제할 수 있고 삭제 버튼은 없다', async () => {
    mockApi({ boards: [notice] })
    post.mockResolvedValue({ data: { data: { ...board, id: 'copy-id' } } })
    renderList()
    const copy = await screen.findByRole('button', { name: '공지사항 복제' })
    expect(copy).toBeEnabled()
    expect(screen.queryByRole('button', { name: '공지사항 휴지통으로' })).not.toBeInTheDocument()
    await userEvent.click(copy)
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/n1/duplicate'))
    await screen.findByText('이동한 화면')
    expect(del).not.toHaveBeenCalled()
  })

  it('보기 전용에는 복제 · 삭제 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({})
    renderList()
    await screen.findByRole('link', { name: '병원 소식 설정' })
    expect(screen.queryByRole('button', { name: '병원 소식 복제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '병원 소식 휴지통으로' })).not.toBeInTheDocument()
  })

  it('한도를 넘으면 복제만 막고 기존 게시판은 삭제할 수 있다', async () => {
    mockApi({ limits: closedLimits })
    renderList()
    expect(await screen.findByRole('button', { name: '병원 소식 복제' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '병원 소식 휴지통으로' })).toBeEnabled()
  })

  it('한도 조회 실패는 안내하고 복제를 막는다', async () => {
    mockApi({})
    const original = get.getMockImplementation()!
    get.mockImplementation((url: string, ...args: unknown[]) =>
      url === '/v1/boards/limits' ? Promise.reject(new Error('x')) : original(url, ...args)
    )
    renderList()
    expect(await screen.findByRole('alert')).toHaveTextContent('게시판 한도를 확인하지 못했습니다.')
    expect(screen.getByRole('button', { name: '병원 소식 복제' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '병원 소식 휴지통으로' })).toBeEnabled()
  })

  it('삭제 확인에는 이름 · 글 수 · 주소 영향을 안내하고 취소하면 요청하지 않는다', async () => {
    mockApi({})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: '병원 소식 휴지통으로' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('병원 소식'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('글 2개'))
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('홈페이지 메뉴와 주소에서 빠집니다')
    )
    expect(del).not.toHaveBeenCalled()
  })

  it('확인 후 삭제하면 목록을 갱신하고 검색 조건을 유지한다', async () => {
    mockApi({})
    const original = get.getMockImplementation()!
    let boards = [board]
    get.mockImplementation((url: string, ...args: unknown[]) =>
      url === '/v1/boards' ? ok(boards) : original(url, ...args)
    )
    del.mockImplementation(() => {
      boards = []
      return ok({})
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderList('/admin/boards?q=병원')
    await userEvent.click(await screen.findByRole('button', { name: '병원 소식 휴지통으로' }))
    await screen.findByText('아직 게시판이 없습니다.')
    expect(del).toHaveBeenCalledWith('/v1/boards/b1')
    expect(toast.success).toHaveBeenCalledWith('휴지통으로 옮겼습니다.')
    expect(screen.getByRole('searchbox', { name: '게시판 이름' })).toHaveValue('병원')
    expect(get.mock.calls.filter(([url]) => url === '/v1/boards').length).toBeGreaterThan(1)
  })

  it('서버가 복제 한도를 거부하면 이유를 알리고 원본 목록을 유지한다', async () => {
    mockApi({})
    post.mockRejectedValue({
      response: {
        data: {
          error: { code: 'PLAN_LIMIT_EXCEEDED', message: '게시판은 5개까지 만들 수 있습니다.' },
        },
      },
    })
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: '병원 소식 복제' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('게시판은 5개까지 만들 수 있습니다.')
    )
    expect(screen.getByRole('link', { name: '병원 소식 설정' })).toBeInTheDocument()
    expect(screen.queryByText('이동한 화면')).not.toBeInTheDocument()
  })

  it('삭제 실패는 목록을 유지하고 재시도할 수 있다', async () => {
    mockApi({})
    del.mockRejectedValue(new Error('x'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderList()
    await userEvent.click(await screen.findByRole('button', { name: '병원 소식 휴지통으로' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('삭제하지 못했습니다.'))
    expect(screen.getByRole('link', { name: '병원 소식 설정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '병원 소식 휴지통으로' })).toBeEnabled()
  })

  it('복제 처리 중 중복 요청과 다른 행의 복제 · 삭제를 막는다', async () => {
    mockApi({ boards: [board, { ...board, id: 'b2', name: '다른 게시판' }] })
    let finish!: () => void
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ data: { data: { ...board, id: 'copy-id' } } })
        })
    )
    renderList()
    await userEvent.dblClick(await screen.findByRole('button', { name: '병원 소식 복제' }))
    expect(post).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '다른 게시판 복제' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다른 게시판 휴지통으로' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '병원 소식 휴지통으로' })).toBeDisabled()
    await act(async () => finish())
    await screen.findByText('이동한 화면')
  })
})
