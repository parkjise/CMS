import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, Post, PostAttachment } from '@cms/types'
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
  status: 'ACTIVE',
  system_key: null,
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
} as Board

const pdf: PostAttachment = {
  id: 'f1',
  name: '진료 안내.pdf',
  size: 2048,
  url: 'http://cdn/t/attachments/f1.pdf',
  content_type: 'application/pdf',
}

const existing: Post = {
  id: 'p1',
  board_id: 'b1',
  title: '공지',
  status: 'PUBLISHED',
  is_pinned: false,
  is_secret: false,
  published_at: '2026-11-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  deleted_at: null,
  custom_data: {},
  body: [],
  attachments: [pdf],
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = (boards: Board[] = [board]) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url.endsWith('/posts/p1')) return ok(existing)
    if (url.endsWith('/versions')) return ok([])
    if (url.endsWith('/categories') || url.endsWith('/fields')) return ok([])
    return ok(null)
  })

const renderAt = (path: string, pattern: string) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={<BoardPostEditPage />} />
        <Route path="*" element={<p>이동한 화면</p>} />
      </Routes>
    </MemoryRouter>
  )

const renderNew = () => renderAt('/admin/boards/b1/posts/new', '/admin/boards/:boardId/posts/new')
const renderEdit = () =>
  renderAt('/admin/boards/b1/posts/p1/edit', '/admin/boards/:boardId/posts/:postId/edit')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('글 첨부 파일 (T-194)', () => {
  it('파일을 올리면 목록에 보이고, 저장할 때 함께 보낸다', async () => {
    mockApi()
    post.mockImplementation((url: string) =>
      url.endsWith('/attachments') ? ok(pdf) : ok({ id: 'p9' })
    )
    renderNew()
    await userEvent.type(await screen.findByLabelText(/제목/), '진료 안내')
    await userEvent.upload(
      screen.getByLabelText('첨부할 파일'),
      new File(['%PDF'], '진료 안내.pdf', { type: 'application/pdf' })
    )

    expect(await screen.findByRole('link', { name: '진료 안내.pdf' })).toBeInTheDocument()
    expect(post.mock.calls[0][0]).toBe('/v1/boards/b1/attachments')
    expect(post.mock.calls[0][1]).toBeInstanceOf(FormData)

    await userEvent.click(screen.getByRole('button', { name: '공개하기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/v1/boards/b1/posts',
        expect.objectContaining({ attachment_ids: ['f1'] })
      )
    )
  })

  it('올리기에 실패하면 이유를 알린다', async () => {
    mockApi()
    post.mockRejectedValue({
      response: { data: { error: { message: '파일 내용이 확장자와 맞지 않습니다.' } } },
    })
    renderNew()
    await userEvent.upload(
      await screen.findByLabelText('첨부할 파일'),
      new File(['MZ'], '가짜.pdf', { type: 'application/pdf' })
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('가짜.pdf'))
    )
    expect(screen.queryByRole('link', { name: '가짜.pdf' })).not.toBeInTheDocument()
  })

  it('붙인 파일을 빼고 저장하면 빈 목록을 보낸다', async () => {
    mockApi()
    patch.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderEdit()
    await userEvent.click(await screen.findByRole('button', { name: '진료 안내.pdf 빼기' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/v1/boards/b1/posts/p1',
        expect.objectContaining({ attachment_ids: [] })
      )
    )
  })

  it('첨부를 건드리지 않으면 보내지 않는다', async () => {
    mockApi()
    patch.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderEdit()
    await screen.findByRole('link', { name: '진료 안내.pdf' })
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).not.toHaveProperty('attachment_ids')
  })

  it('회원만 읽는 게시판에는 붙일 수 없다고 안내한다', async () => {
    mockApi([{ ...board, permissions: { read: 'MEMBER', write: 'ADMIN' } } as Board])
    renderNew()
    expect(await screen.findByText(/회원만 읽는 게시판에는 아직 파일을/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '파일 올리기' })).not.toBeInTheDocument()
  })
})

describe('글 목록 📎 표시 (T-197)', () => {
  it('첨부가 있는 글만 제목 옆에 클립', async () => {
    const item = { ...existing, attachments: undefined, has_attachments: true }
    get.mockImplementation((url: string) => {
      if (url === '/v1/boards') return ok([board])
      if (url.includes('/posts'))
        return ok({
          total: 2,
          page: 1,
          size: 20,
          items: [item, { ...item, id: 'p2', title: '그냥 글', has_attachments: false }],
        })
      return ok([])
    })
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards/b1/posts']}>
        <Routes>
          <Route path="/admin/boards/:boardId/posts" element={<BoardPostsPage />} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByRole('link', { name: '그냥 글' })
    expect(screen.getAllByRole('img', { name: '첨부 파일' })).toHaveLength(1)
  })
})
