import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, PermissionOptions, PostListItem, ReportedPost } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { breadcrumbsFor } from '@/components/layout/navigation'
import { BoardOperationPage } from '@/pages/BoardOperationPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { ReportedPostsPage } from '@/pages/ReportedPostsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, post, patch } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  updated_at: '2026-11-05T00:00:00Z',
  id: 'b1',
  name: '방명록',
  slug: 'guestbook',
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
  permissions: { read: 'PUBLIC', write: 'MEMBER' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
}

const reported: ReportedPost = {
  post_id: 'p1',
  board_id: 'b1',
  board_name: '방명록',
  title: '광고 글',
  status: 'PRIVATE',
  deleted: false,
  report_count: 3,
  reasons: { SPAM: 2, ABUSE: 1 },
  details: ['같은 링크 반복'],
  latest_at: '2026-11-06T03:00:00Z',
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })
const setRole = (role: string) => useAuthStore.setState({ user: { role } } as never)

const mockApi = (routes: Record<string, unknown>) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([board])
    for (const [suffix, data] of Object.entries(routes)) if (url.endsWith(suffix)) return ok(data)
    if (url.endsWith('/categories') || url.endsWith('/fields')) return ok([])
    return ok(null)
  })

const renderAt = (path: string, pattern: string, element: ReactNode) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>,
  )

const renderReports = () => renderAt('/admin/posts/reports', '/admin/posts/reports', <ReportedPostsPage />)

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('신고된 글 (T-151-B)', () => {
  it('신고 수 · 사유 · 설명을 보여 준다', async () => {
    mockApi({ '/posts/reports': [reported] })
    renderReports()
    const row = (await screen.findByRole('link', { name: '광고 글' })).closest('li')!
    expect(within(row).getByText(/신고 3건 · 스팸 · 광고 2, 욕설 · 비방 1/)).toBeInTheDocument()
    expect(within(row).getByText('같은 링크 반복')).toBeInTheDocument()
    expect(within(row).getByText('비공개')).toBeInTheDocument()
  })

  it('없으면 안내', async () => {
    mockApi({ '/posts/reports': [] })
    renderReports()
    expect(await screen.findByText('처리할 신고가 없습니다.')).toBeInTheDocument()
  })

  it('비공개된 글은 다시 공개할 수 있다', async () => {
    mockApi({ '/posts/reports': [reported] })
    post.mockResolvedValue({ data: { data: { resolved: true } } })
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: '다시 공개' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/p1/reports/resolve', { action: 'PUBLISH' }),
    )
    expect(toast.success).toHaveBeenCalledWith('신고를 닫고 글을 다시 공개했습니다.')
    expect(screen.queryByRole('button', { name: '비공개로' })).not.toBeInTheDocument()
  })

  it('공개 글은 비공개 · 휴지통 (휴지통은 확인)', async () => {
    mockApi({ '/posts/reports': [{ ...reported, status: 'PUBLISHED' }] })
    post.mockResolvedValue({ data: { data: { resolved: true } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderReports()
    await userEvent.click(await screen.findByRole('button', { name: '휴지통으로' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/posts/p1/reports/resolve', { action: 'DELETE' }))
    expect(screen.queryByRole('button', { name: '다시 공개' })).not.toBeInTheDocument()
  })

  it('보기 전용 계정은 처리 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({ '/posts/reports': [reported] })
    renderReports()
    expect(await screen.findByRole('link', { name: '광고 글' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '신고 닫기' })).not.toBeInTheDocument()
  })

  it('위치 표시', () => {
    expect(breadcrumbsFor('/admin/posts/reports')).toEqual([
      { label: '게시판 관리', to: '/admin/boards' },
      { label: '신고된 글' },
    ])
  })
})

describe('비회원 글쓰기 설정 (T-151-B)', () => {
  const renderOperation = (
    options: PermissionOptions = { member_read_blocked: null, member_write_blocked: null },
  ) => {
    mockApi({ '/permission-options': options })
    return renderAt('/admin/boards/b1/operation', '/admin/boards/:boardId/operation', <BoardOperationPage />)
  }

  it('켜서 저장한다', async () => {
    patch.mockResolvedValue({ data: { data: board } })
    renderOperation()
    await userEvent.click(await screen.findByText('비회원 글쓰기 허용'))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
        operation: { allow_secret: false, notify_new_post: false, allow_guest: true },
      }),
    )
  })

  it('병원 업종 등으로 막혔으면 이유와 함께 고를 수 없다', async () => {
    renderOperation({ member_read_blocked: null, member_write_blocked: '병원 업종은 홈페이지 회원 글쓰기를 쓸 수 없습니다.' })
    expect(await screen.findByText('병원 업종은 홈페이지 회원 글쓰기를 쓸 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText(/비회원 글쓰기 허용/)).toBeDisabled()
  })
})

describe('글 목록의 비회원 표시 (T-151-B)', () => {
  it('비회원 · 이름', async () => {
    const item: PostListItem = {
      id: 'p1',
      board_id: 'b1',
      title: '방문 후기',
      status: 'PUBLISHED',
      is_pinned: false,
      published_at: '2026-11-06T00:00:00Z',
      created_at: '2026-11-06T00:00:00Z',
      updated_at: '2026-11-06T00:00:00Z',
      deleted_at: null,
      custom_data: {},
      guest_name: '손님',
    }
    mockApi({ '/posts': { total: 1, page: 1, size: 20, items: [item] } })
    renderAt('/admin/boards/b1/posts', '/admin/boards/:boardId/posts', <BoardPostsPage />)
    const row = (await screen.findByText('방문 후기')).closest('li')!
    expect(within(row).getByText('비회원 · 손님')).toBeInTheDocument()
  })
})
