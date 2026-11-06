import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, Post, PostListItem } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { useSSENotifications } from '@/hooks/useSSENotifications'
import { BoardOperationPage } from '@/pages/BoardOperationPage'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/boards/RichTextEditor', () => ({ RichTextEditor: () => <div>본문 편집기</div> }))
vi.mock('@/lib/api', () => ({ api: { get, post, patch } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  id: 'b1',
  name: '고객 문의',
  slug: 'qna',
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

const ok = (data: unknown) => Promise.resolve({ data: { data } })
const setRole = (role: string) => useAuthStore.setState({ user: { role } } as never)

const mockApi = (boards: Board[] = [board], extra: Record<string, unknown> = {}) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    for (const [suffix, data] of Object.entries(extra)) if (url.endsWith(suffix)) return ok(data)
    if (url.endsWith('/categories') || url.endsWith('/fields')) return ok([])
    return ok(null)
  })

const renderAt = (path: string, pattern: string, element: ReactNode) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
        <Route path="*" element={<p>이동한 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('운영 설정 (T-151-A)', () => {
  const renderPage = (boards?: Board[]) => {
    mockApi(boards)
    return renderAt('/admin/boards/b1/operation', '/admin/boards/:boardId/operation', <BoardOperationPage />)
  }

  it('비밀글 허용 · 새 글 알림을 저장한다', async () => {
    patch.mockResolvedValue({ data: { data: board } })
    renderPage()
    const save = await screen.findByRole('button', { name: '저장' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByText('비밀글 허용'))
    await userEvent.click(screen.getByText('새 글 알림'))
    await userEvent.click(save)
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
        operation: { allow_secret: true, notify_new_post: true, allow_guest: false },
      }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('비밀글 허용을 끄면 이미 쓴 비밀글은 남는다고 알린다', async () => {
    renderPage([{ ...board, operation: { allow_secret: true, notify_new_post: false, allow_guest: false } }])
    await userEvent.click(await screen.findByText('비밀글 허용'))
    expect(screen.getByText(/이미 쓴 비밀글은 그대로/)).toBeInTheDocument()
  })

  it('회원 글쓰기가 아니면 언제 쓰이는지 안내', async () => {
    renderPage([{ ...board, permissions: { read: 'PUBLIC', write: 'ADMIN' } }])
    expect(await screen.findByText(/글쓰기를 회원도로 바꾸면 적용됩니다/)).toBeInTheDocument()
  })

  it('보기 전용 계정은 저장 버튼이 없고, 기본 게시판에는 설정이 없다', async () => {
    setRole('TENANT_VIEWER')
    const { unmount } = renderPage()
    expect(await screen.findByText('비밀글 허용')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    unmount()
    renderPage([{ ...board, system_key: 'notice' }])
    expect(await screen.findByText('기본 게시판에는 운영 설정이 없습니다.')).toBeInTheDocument()
  })
})

describe('비밀글 — 관리자 (T-151-A)', () => {
  const item: PostListItem = {
    id: 'p1',
    board_id: 'b1',
    title: '비밀 질문',
    status: 'PUBLISHED',
    is_pinned: false,
    is_secret: true,
    published_at: '2026-11-06T00:00:00Z',
    created_at: '2026-11-06T00:00:00Z',
    updated_at: '2026-11-06T00:00:00Z',
    deleted_at: null,
    custom_data: {},
  }

  it('글 목록에 비밀글 표시', async () => {
    mockApi([board], { '/posts': { total: 1, page: 1, size: 20, items: [item] } })
    renderAt('/admin/boards/b1/posts', '/admin/boards/:boardId/posts', <BoardPostsPage />)
    expect(await screen.findByText('비밀글')).toBeInTheDocument()
  })

  it('비밀글을 허용한 게시판은 글쓰기에서 고른다', async () => {
    mockApi([{ ...board, operation: { allow_secret: true, notify_new_post: false, allow_guest: false } }])
    post.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderAt('/admin/boards/b1/posts/new', '/admin/boards/:boardId/posts/new', <BoardPostEditPage />)
    await userEvent.type(await screen.findByLabelText(/제목/), '관리자 비밀')
    await userEvent.click(await screen.findByText('비밀글'))
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards/b1/posts', expect.objectContaining({ is_secret: true })),
    )
  })

  it('허용하지 않은 게시판은 고르는 칸이 없고 보내지 않는다', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderAt('/admin/boards/b1/posts/new', '/admin/boards/:boardId/posts/new', <BoardPostEditPage />)
    await userEvent.type(await screen.findByLabelText(/제목/), '글')
    expect(screen.queryByText('비밀글')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).not.toHaveProperty('is_secret')
  })

  it('허용을 꺼도 이미 비밀글이면 고칠 때 고를 수 있다', async () => {
    const existing: Post = { ...item, body: [], custom_data: {} }
    mockApi([board], { '/posts/p1': existing })
    renderAt('/admin/boards/b1/posts/p1/edit', '/admin/boards/:boardId/posts/:postId/edit', <BoardPostEditPage />)
    expect(await screen.findByText('비밀글')).toBeInTheDocument()
  })
})

describe('새 글 알림 — 관리자 화면 (T-151-A)', () => {
  class FakeEventSource {
    static last: FakeEventSource | null = null
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    constructor(public url: string) {
      FakeEventSource.last = this
    }
    close() {}
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    useAuthStore.setState({ accessToken: 'token', isAuthenticated: true } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('새 글이면 게시판 이름과 제목으로 알린다', () => {
    renderHook(() => useSSENotifications())
    act(() => {
      FakeEventSource.last?.onmessage?.({
        data: JSON.stringify({ type: 'new_post', board_id: 'b1', board_name: '고객 문의', post_id: 'p1', title: '질문' }),
      })
    })
    expect(toast.info).toHaveBeenCalledWith('새 글: 고객 문의 — 질문')
  })

  it('문의 알림은 그대로', () => {
    renderHook(() => useSSENotifications())
    act(() => {
      FakeEventSource.last?.onmessage?.({
        data: JSON.stringify({ type: 'new_inquiry', id: 'i1', name: '홍길동', inquiry_type: '상담' }),
      })
    })
    expect(toast.info).toHaveBeenCalledWith('새 문의: 홍길동님 (상담)')
  })
})
