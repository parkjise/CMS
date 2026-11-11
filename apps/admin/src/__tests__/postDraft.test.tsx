import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, Post } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// 실제 편집기처럼 처음 내용을 한 번 알린다
vi.mock('@/components/boards/RichTextEditor', async () => {
  const { useEffect } = await import('react')
  return {
    RichTextEditor: ({
      initial,
      onChange,
    }: {
      initial: unknown[]
      onChange: (body: unknown[]) => void
    }) => {
      useEffect(() => onChange(initial), []) // eslint-disable-line react-hooks/exhaustive-deps
      return <div>본문 편집기</div>
    },
  }
})
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
  title: '원래 제목',
  status: 'PUBLISHED',
  is_pinned: false,
  is_secret: false,
  published_at: '2026-11-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  deleted_at: null,
  custom_data: {},
  body: [],
}

const NEW_KEY = 'cms-post-draft:b1:new'
const EDIT_KEY = 'cms-post-draft:b1:p1'
const AUTOSAVE_WAIT = { timeout: 3500 }

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = () =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([board])
    if (url.endsWith('/posts/p1')) return ok(existing)
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

const renderEdit = () =>
  renderAt(
    '/admin/boards/b1/posts/p1/edit',
    '/admin/boards/:boardId/posts/:postId/edit',
    <BoardPostEditPage />
  )

const storeDraft = (key: string, fields: Record<string, unknown> = {}) =>
  localStorage.setItem(
    key,
    JSON.stringify({
      saved_at: '2026-11-11T05:20:00Z',
      title: '보관한 제목',
      body: [{ type: 'p', text: '보관한 본문' }],
      is_pinned: true,
      is_secret: false,
      category_id: '',
      custom: {},
      ...fields,
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  mockApi()
})

describe('글 자동 보관 (T-190)', () => {
  it('쓰던 내용을 잠시 뒤 브라우저에 보관한다', async () => {
    renderNew()
    await userEvent.type(await screen.findByLabelText(/제목/), '쓰던 글')

    await waitFor(() => expect(localStorage.getItem(NEW_KEY)).not.toBeNull(), AUTOSAVE_WAIT)
    expect(JSON.parse(localStorage.getItem(NEW_KEY) ?? '{}')).toMatchObject({ title: '쓰던 글' })
    expect(screen.getByText(/자동 보관됨/)).toBeInTheDocument()
  })

  it('손대지 않은 글은 보관하지 않는다', async () => {
    renderEdit()
    await screen.findByDisplayValue('원래 제목')
    await new Promise((resolve) => setTimeout(resolve, 2300))
    expect(localStorage.getItem(EDIT_KEY)).toBeNull()
  })

  it('보관본이 있으면 이어서 쓸 수 있다', async () => {
    storeDraft(EDIT_KEY, { saved_at: '2026-11-11T05:20:00Z' })
    renderEdit()
    expect(await screen.findByText(/저장하지 않은 내용이 있어요/)).toBeInTheDocument()
    expect(screen.getByLabelText(/제목/)).toHaveValue('원래 제목')

    await userEvent.click(screen.getByRole('button', { name: '이어서 쓰기' }))
    expect(screen.getByLabelText(/제목/)).toHaveValue('보관한 제목')
    expect(screen.queryByText(/저장하지 않은 내용이 있어요/)).not.toBeInTheDocument()

    patch.mockResolvedValue({ data: { data: { id: 'p1' } } })
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/v1/boards/b1/posts/p1',
        expect.objectContaining({
          title: '보관한 제목',
          is_pinned: true,
          body: [{ type: 'p', text: '보관한 본문' }],
        })
      )
    )
    // 저장하면 보관본은 지운다
    expect(localStorage.getItem(EDIT_KEY)).toBeNull()
  })

  it('버리기를 누르면 보관본을 지운다', async () => {
    storeDraft(NEW_KEY)
    renderNew()
    await userEvent.click(await screen.findByRole('button', { name: '버리기' }))
    expect(localStorage.getItem(NEW_KEY)).toBeNull()
    expect(screen.getByLabelText(/제목/)).toHaveValue('')
  })

  it('보관한 뒤 다른 곳에서 저장한 글이면 낡은 보관본을 묻지 않고 지운다', async () => {
    storeDraft(EDIT_KEY, { saved_at: '2026-11-09T00:00:00Z' })
    renderEdit()
    await screen.findByDisplayValue('원래 제목')
    expect(screen.queryByText(/저장하지 않은 내용이 있어요/)).not.toBeInTheDocument()
    expect(localStorage.getItem(EDIT_KEY)).toBeNull()
  })

  it('보기 전용 계정은 보관도 묻지도 않는다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    storeDraft(EDIT_KEY)
    renderEdit()
    await screen.findByDisplayValue('원래 제목')
    expect(screen.queryByText(/저장하지 않은 내용이 있어요/)).not.toBeInTheDocument()
  })
})
