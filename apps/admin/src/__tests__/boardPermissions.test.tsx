import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router'
import type { Board, PermissionOptions, PostListItem } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardSetupPage } from '@/pages/BoardSetupPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, patch } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  updated_at: '2026-11-05T00:00:00Z',
  id: 'b1',
  name: '자유게시판',
  slug: 'free',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  post_count: 1,
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

const OPEN: PermissionOptions = { member_read_blocked: null, member_write_blocked: null }
const HOSPITAL = '병원 업종은 홈페이지 회원 글쓰기를 쓸 수 없습니다.'
const ok = (data: unknown) => Promise.resolve({ data: { data } })

const setRole = (role: string) => useAuthStore.setState({ user: { role } } as never)

const renderPage = (boards: Board[] = [board], options: PermissionOptions = OPEN) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url.endsWith('/permission-options')) return ok(options)
    if (url.endsWith('/menu-parents') || url.endsWith('/usage')) return ok([])
    return ok(null)
  })
  // 권한은 게시판 설정 한 화면의 구역 — 저장은 아래 저장 막대 (T-228)
  const router = createMemoryRouter(
    [{ path: '/admin/boards/:boardId/settings', element: <BoardSetupPage /> }],
    { initialEntries: ['/admin/boards/b1/settings'] },
  )
  return renderWithQuery(<RouterProvider router={router} />)
}
const SAVE = { name: '변경사항 저장' }

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('게시판 권한 — 읽기 (T-150-A)', () => {
  it('회원만 읽기로 바꿔 저장한다', async () => {
    patch.mockResolvedValue({ data: { data: board } })
    renderPage()
    const save = await screen.findByRole('button', SAVE)
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/회원만/))
    expect(screen.getByText(/로그인 안내가 나옵니다/)).toBeInTheDocument()
    await userEvent.click(save)
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', { permissions: { read: 'MEMBER', write: 'ADMIN' } }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('서버가 거절하면 메시지를 보여 준다', async () => {
    patch.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: { message: '방문자 회원 기능이 꺼져 있어' } } },
    })
    renderPage()
    await userEvent.click(await screen.findByLabelText(/회원만/))
    await userEvent.click(screen.getByRole('button', SAVE))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('회원 기능이 꺼져 있으면 회원만을 고를 수 없다', async () => {
    renderPage([board], { member_read_blocked: '꺼짐', member_write_blocked: '꺼짐' })
    await waitFor(() => expect(screen.getByLabelText(/회원만/)).toBeDisabled())
    expect(screen.getByText(/회원만 읽기를 고를 수 없습니다/)).toBeInTheDocument()
  })

  it('이미 회원만인데 회원 기능이 꺼졌으면 경고하고 누구나로 되돌릴 수 있다', async () => {
    renderPage([{ ...board, permissions: { read: 'MEMBER', write: 'ADMIN' } }], {
      member_read_blocked: '꺼짐',
      member_write_blocked: '꺼짐',
    })
    expect(await screen.findByText(/아무도 이 게시판의 글을 읽을 수 없습니다/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/누구나/))
    expect(screen.getByRole('button', SAVE)).toBeEnabled()
  })

  it('보기 전용 계정은 저장 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    renderPage()
    expect(await screen.findByLabelText(/누구나/)).toBeInTheDocument()
    expect(screen.queryByRole('button', SAVE)).not.toBeInTheDocument()
  })

  it('기본 게시판은 권한 구역이 없다', async () => {
    renderPage([{ ...board, system_key: 'notice' }])
    expect(await screen.findByRole('heading', { name: '기본 정보' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '권한' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/회원만/)).not.toBeInTheDocument()
  })
})

describe('게시판 권한 — 글쓰기 (T-150-B)', () => {
  it('회원도 쓰기로 바꿔 저장한다', async () => {
    patch.mockResolvedValue({ data: { data: board } })
    renderPage()
    await userEvent.click(await screen.findByLabelText(/회원도/))
    expect(screen.getByText(/1시간에 10개까지/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', SAVE))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', { permissions: { read: 'PUBLIC', write: 'MEMBER' } }),
    )
  })

  it('병원 업종 · 필수 칸이면 이유를 보여 주고 고를 수 없다', async () => {
    renderPage([board], { member_read_blocked: null, member_write_blocked: HOSPITAL })
    await waitFor(() => expect(screen.getByLabelText(/회원도/)).toBeDisabled())
    // 운영 설정 구역(비회원 글쓰기)에도 같은 까닭이 나온다
    expect(within(screen.getByRole('region', { name: '권한' })).getByText(HOSPITAL)).toBeInTheDocument()
    expect(screen.getByLabelText(/회원만/)).toBeEnabled()
  })

  it('이미 켜 뒀는데 막혔으면(업종 변경 등) 경고하고 끌 수 있다', async () => {
    renderPage([{ ...board, permissions: { read: 'PUBLIC', write: 'MEMBER' } }], {
      member_read_blocked: null,
      member_write_blocked: HOSPITAL,
    })
    expect(await screen.findByText(/지금은 회원이 글을 쓸 수 없습니다/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /관리자만/ }))
    expect(screen.getByRole('button', SAVE)).toBeEnabled()
  })
})

describe('글 관리 — 회원 작성 표시 (T-150-B)', () => {
  it('홈페이지 회원 글은 회원 이름과 함께', async () => {
    const memberPost: PostListItem = {
      id: 'p1',
      board_id: 'b1',
      title: '회원이 쓴 글',
      status: 'PUBLISHED',
      is_pinned: false,
      published_at: '2026-11-06T00:00:00Z',
      created_at: '2026-11-06T00:00:00Z',
      updated_at: '2026-11-06T00:00:00Z',
      deleted_at: null,
      custom_data: {},
      author_member_id: 'm1',
      author_member_name: '홍길동',
    }
    get.mockImplementation((url: string) => {
      if (url === '/v1/boards') return ok([board])
      if (url.endsWith('/posts')) return ok({ total: 1, page: 1, size: 20, items: [memberPost] })
      if (url.endsWith('/categories') || url.endsWith('/fields') || url.endsWith('/usage')) return ok([])
      return ok(null)
    })
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards/b1/posts']}>
        <Routes>
          <Route path="/admin/boards/:boardId/posts" element={<BoardPostsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const row = (await screen.findByText('회원이 쓴 글')).closest('li')!
    expect(within(row).getByText('회원 작성 · 홍길동')).toBeInTheDocument()
  })
})

describe('권한 구역의 역할 × 동작 표 (T-213)', () => {
  it('선택을 바꾸면 저장 전에도 표가 바로 바뀐다', async () => {
    setRole('TENANT_ADMIN')
    renderPage()
    const table = await screen.findByRole('table', { name: '역할별 권한 요약' })
    const memberRow = () =>
      within(within(table).getByRole('row', { name: /^회원/ }))
        .getAllByRole('cell')
        .map((c) => within(c).queryByRole('img')?.getAttribute('aria-label') ?? c.textContent)
    expect(memberRow()).toEqual(['가능', '불가', '불가', '불가'])
    await userEvent.click(screen.getByRole('radio', { name: /회원도/ }))
    expect(memberRow()).toEqual(['가능', '가능', '본인 글', '본인 글'])
    expect(patch).not.toHaveBeenCalled()
  })
})
