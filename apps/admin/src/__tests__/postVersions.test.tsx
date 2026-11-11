import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, Post, PostVersion, PostVersionDetail } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/boards/RichTextEditor', () => ({
  RichTextEditor: ({ initial }: { initial: { text?: string }[] }) => (
    <div>{initial.map((node) => node.text).join(' ') || '본문 편집기'}</div>
  ),
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
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
} as Board

const existing: Post = {
  id: 'p1',
  board_id: 'b1',
  title: '지금 제목',
  status: 'PUBLISHED',
  is_pinned: false,
  is_secret: false,
  published_at: '2026-11-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  deleted_at: null,
  custom_data: {},
  body: [{ type: 'p', text: '지금 본문' }],
}

const version: PostVersion = {
  id: 'v1',
  title: '예전 제목',
  status: 'PUBLISHED',
  saved_at: '2026-11-09T01:00:00Z',
  replaced_at: '2026-11-10T00:00:00Z',
  editor: 'admin@test.com',
}

const detail: PostVersionDetail = {
  ...version,
  body: [{ type: 'p', text: '예전 본문' }],
  custom_data: {},
  category_id: null,
  is_pinned: true,
  is_secret: false,
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = (versions: PostVersion[] = [version]) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([board])
    if (url.endsWith('/versions/v1')) return ok(detail)
    if (url.endsWith('/versions')) return ok(versions)
    if (url.endsWith('/posts/p1')) return ok(existing)
    if (url.endsWith('/categories') || url.endsWith('/fields')) return ok([])
    return ok(null)
  })

const renderEdit = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={['/admin/boards/b1/posts/p1/edit']}>
      <Routes>
        <Route path="/admin/boards/:boardId/posts/:postId/edit" element={<BoardPostEditPage />} />
        <Route path="*" element={<p>이동한 화면</p>} />
      </Routes>
    </MemoryRouter>
  )

const openPanel = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /이전 버전 \(1\)/ }))
  await userEvent.click(await screen.findByRole('button', { name: /예전 제목/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.scrollTo = vi.fn()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('글 이전 버전 (T-191)', () => {
  it('이전 버전 목록과 내용을 보여 준다', async () => {
    mockApi()
    renderEdit()
    await openPanel()
    expect(screen.getByText(/admin@test.com이\(가\)/)).toBeInTheDocument()
    expect(await screen.findByText('예전 본문')).toBeInTheDocument()
  })

  it('되돌리면 편집 칸만 채우고, 저장하면 그 내용으로 바뀐다', async () => {
    mockApi()
    patch.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderEdit()
    await openPanel()
    await userEvent.click(await screen.findByRole('button', { name: '이 버전으로 되돌리기' }))

    expect(screen.getByLabelText(/제목/)).toHaveValue('예전 제목')
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('저장해야'))
    expect(patch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/v1/boards/b1/posts/p1',
        expect.objectContaining({ title: '예전 제목', is_pinned: true })
      )
    )
  })

  it('이전 버전이 없으면 안내한다', async () => {
    mockApi([])
    renderEdit()
    await userEvent.click(await screen.findByRole('button', { name: /이전 버전 \(0\)/ }))
    expect(screen.getByText(/아직 이전 버전이 없어요/)).toBeInTheDocument()
  })

  it('보기 전용 계정은 볼 수만 있고 되돌릴 수 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    mockApi()
    renderEdit()
    await openPanel()
    const preview = await screen.findByText('예전 본문')
    expect(within(preview.parentElement as HTMLElement).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: '이 버전으로 되돌리기' })).not.toBeInTheDocument()
  })

  it('새 글에는 이전 버전이 없다', async () => {
    mockApi()
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards/b1/posts/new']}>
        <Routes>
          <Route path="/admin/boards/:boardId/posts/new" element={<BoardPostEditPage />} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByLabelText(/제목/)
    expect(screen.queryByRole('button', { name: /이전 버전/ })).not.toBeInTheDocument()
  })
})
