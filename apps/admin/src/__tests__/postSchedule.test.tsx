import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, Post, PostListItem } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/boards/RichTextEditor', () => ({
  RichTextEditor: () => <div>본문 편집기</div>,
}))
vi.mock('@/lib/api', () => ({ api: { get, post, patch } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board = {
  id: 'b1',
  name: '소식',
  slug: 'news',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
} as Board

const tomorrow = dayjs().add(1, 'day').hour(9).minute(0).second(0).millisecond(0)

const scheduled: PostListItem = {
  id: 'p1',
  board_id: 'b1',
  title: '예약 글',
  status: 'PUBLISHED',
  is_pinned: false,
  is_secret: false,
  published_at: tomorrow.toISOString(),
  created_at: '2026-11-06T00:00:00Z',
  updated_at: '2026-11-06T00:00:00Z',
  deleted_at: null,
  custom_data: {},
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = (extra: Record<string, unknown> = {}) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([board])
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
    </MemoryRouter>
  )

const renderNew = () =>
  renderAt('/admin/boards/b1/posts/new', '/admin/boards/:boardId/posts/new', <BoardPostEditPage />)

const renderEdit = (existing: Post) => {
  mockApi({ '/posts/p1': existing })
  return renderAt(
    '/admin/boards/b1/posts/p1/edit',
    '/admin/boards/:boardId/posts/:postId/edit',
    <BoardPostEditPage />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('예약 공개 (T-189)', () => {
  it('예약을 고르면 정한 시각을 함께 보낸다', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderNew()
    await userEvent.type(await screen.findByLabelText(/제목/), '내일 공지')
    await userEvent.click(screen.getByRole('radio', { name: '예약' }))
    fireEvent.change(screen.getByLabelText('공개할 날짜와 시각'), {
      target: { value: tomorrow.format('YYYY-MM-DDTHH:mm') },
    })
    await userEvent.click(screen.getByRole('button', { name: '예약 공개' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/v1/boards/b1/posts',
        expect.objectContaining({ status: 'PUBLISHED', published_at: tomorrow.toISOString() })
      )
    )
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('예약했습니다.'))
  })

  it('시각을 고르지 않거나 지난 시각이면 보내지 않는다', async () => {
    mockApi()
    renderNew()
    await userEvent.type(await screen.findByLabelText(/제목/), '글')
    await userEvent.click(screen.getByRole('radio', { name: '예약' }))
    await userEvent.click(screen.getByRole('button', { name: '예약 공개' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('날짜와 시각을 골라 주세요')

    fireEvent.change(screen.getByLabelText('공개할 날짜와 시각'), {
      target: { value: dayjs().subtract(1, 'hour').format('YYYY-MM-DDTHH:mm') },
    })
    await userEvent.click(screen.getByRole('button', { name: '예약 공개' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('지금보다 뒤')
    expect(post).not.toHaveBeenCalled()
  })

  it('임시저장은 예약 시각을 보내지 않는다', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderNew()
    await userEvent.type(await screen.findByLabelText(/제목/), '초안')
    await userEvent.click(screen.getByRole('radio', { name: '예약' }))
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).not.toHaveProperty('published_at')
  })

  it('예약 글을 열면 예약 시각이 채워져 있고, 지금 바로로 바꾸면 예약을 푼다', async () => {
    patch.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderEdit({ ...scheduled, body: [], custom_data: {} })
    expect(await screen.findByLabelText('공개할 날짜와 시각')).toHaveValue(
      tomorrow.format('YYYY-MM-DDTHH:mm')
    )
    await userEvent.click(screen.getByRole('radio', { name: '지금 바로' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/v1/boards/b1/posts/p1',
        expect.objectContaining({ published_at: null })
      )
    )
  })

  it('이미 홈페이지에 나온 글은 공개 시각을 고르지 않는다', async () => {
    renderEdit({ ...scheduled, published_at: '2026-11-01T00:00:00Z', body: [], custom_data: {} })
    await screen.findByDisplayValue('예약 글')
    expect(screen.queryByText('공개 시각')).not.toBeInTheDocument()
  })

  it('글 목록에 예약 시각을 표시한다', async () => {
    mockApi({ '/posts': { total: 1, page: 1, size: 20, items: [scheduled] } })
    renderAt('/admin/boards/b1/posts', '/admin/boards/:boardId/posts', <BoardPostsPage />)
    expect(await screen.findByText(`예약 · ${tomorrow.format('MM/DD HH:mm')}`)).toBeInTheDocument()
  })
})
