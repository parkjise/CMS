import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, BoardCategory, Post } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardCategoriesPage } from '@/pages/BoardCategoriesPage'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/boards/RichTextEditor', () => ({ RichTextEditor: () => <div>본문 편집기</div> }))
vi.mock('@/lib/api', () => ({ api: { get, post, patch, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  id: 'b1',
  name: '채용',
  slug: 'jobs',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  post_count: 3,
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
}

const categoryOf = (over: Partial<BoardCategory> & { id: string; name: string }): BoardCategory => ({
  board_id: 'b1',
  is_active: true,
  display_order: 0,
  post_count: 0,
  ...over,
})

const dev = categoryOf({ id: 'c1', name: '개발', post_count: 2 })
const design = categoryOf({ id: 'c2', name: '디자인', display_order: 1, is_active: false })

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = ({
  boards = [board],
  categories = [dev, design],
  postData,
}: { boards?: Board[]; categories?: BoardCategory[]; postData?: Post } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url.endsWith('/categories')) return ok(categories)
    if (url.endsWith('/fields')) return ok([])
    if (url.endsWith('/posts')) return ok({ total: 0, page: 1, size: 20, items: [] })
    if (url.includes('/posts/')) return ok(postData)
    return ok(null)
  })
}

const setRole = (role: string) => useAuthStore.setState({ user: { role } } as never)

const renderAt = (path: string, pattern: string, element: ReactNode) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
        <Route path="*" element={<p>이동한 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )

const renderCategories = () =>
  renderAt('/admin/boards/b1/categories', '/admin/boards/:boardId/categories', <BoardCategoriesPage />)

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('카테고리 관리', () => {
  it('목록 · 글 수 · 숨김 표시', async () => {
    mockApi()
    renderCategories()
    expect(await screen.findByText('개발')).toBeInTheDocument()
    expect(screen.getByText('글 2개')).toBeInTheDocument()
    expect(screen.getByText('홈페이지에서 숨김')).toBeInTheDocument()
  })

  it('없으면 안내', async () => {
    mockApi({ categories: [] })
    renderCategories()
    expect(await screen.findByText(/아직 카테고리가 없습니다/)).toBeInTheDocument()
  })

  it('추가 — 앞뒤 공백을 지워 보낸다', async () => {
    mockApi({ categories: [] })
    post.mockResolvedValue({ data: { data: dev } })
    renderCategories()
    await userEvent.type(await screen.findByLabelText('새 카테고리'), '  개발  ')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/b1/categories', { name: '개발' }))
    expect(toast.success).toHaveBeenCalled()
  })

  it('이름이 겹치면 서버 메시지를 보여 준다', async () => {
    mockApi()
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: { message: '이미 있는 카테고리 이름입니다.' } } },
    })
    renderCategories()
    await userEvent.type(await screen.findByLabelText('새 카테고리'), '개발')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('이름 바꾸기 · 숨기기', async () => {
    mockApi()
    patch.mockResolvedValue({ data: { data: dev } })
    renderCategories()
    await userEvent.click(await screen.findByRole('button', { name: '개발 이름 바꾸기' }))
    const input = screen.getByLabelText('카테고리 이름')
    await userEvent.clear(input)
    await userEvent.type(input, '개발 직군')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/c1', { name: '개발 직군' }),
    )
    await userEvent.click(screen.getByRole('button', { name: '디자인 보이기' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/c2', { is_active: true }),
    )
  })

  it('순서 바꾸기 — 전체 순서를 보낸다', async () => {
    mockApi()
    patch.mockResolvedValue({ data: { data: [] } })
    renderCategories()
    await userEvent.click(await screen.findByRole('button', { name: '디자인 위로' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/order', { category_ids: ['c2', 'c1'] }),
    )
  })

  it('삭제 — 글이 있으면 옮길 곳을 골라 보낸다', async () => {
    mockApi()
    del.mockResolvedValue({ data: { data: { deleted: true, moved: 2 } } })
    renderCategories()
    await userEvent.click(await screen.findByRole('button', { name: '개발 삭제' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/글 2개는 아래에서 고른 곳으로/)).toBeInTheDocument()
    await userEvent.selectOptions(within(dialog).getByLabelText('글을 옮길 곳'), 'c2')
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith('/v1/boards/b1/categories/c1', { params: { move_to: 'c2' } }),
    )
    expect(toast.success).toHaveBeenCalledWith('삭제하고 글 2개를 옮겼습니다.')
  })

  it('글이 없으면 옮길 곳을 묻지 않는다', async () => {
    mockApi()
    del.mockResolvedValue({ data: { data: { deleted: true, moved: 0 } } })
    renderCategories()
    await userEvent.click(await screen.findByRole('button', { name: '디자인 삭제' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('글을 옮길 곳')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/boards/b1/categories/c2', { params: undefined }))
  })

  it('보기 전용 계정은 바꿀 수 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi()
    renderCategories()
    expect(await screen.findByText('개발')).toBeInTheDocument()
    expect(screen.queryByLabelText('새 카테고리')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '개발 삭제' })).not.toBeInTheDocument()
  })

  it('기본 게시판은 카테고리를 만들 수 없다', async () => {
    mockApi({ boards: [{ ...board, system_key: 'notice' }] })
    renderCategories()
    expect(await screen.findByText('기본 게시판에는 카테고리를 만들 수 없습니다.')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/v1/boards/b1/categories')
  })
})

describe('글의 카테고리', () => {
  it('글쓰기 — 고른 카테고리를 보내고, 숨긴 분류도 고를 수 있다', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderAt('/admin/boards/b1/posts/new', '/admin/boards/:boardId/posts/new', <BoardPostEditPage />)
    await userEvent.type(await screen.findByLabelText(/제목/), '프론트엔드 채용')
    const select = screen.getByLabelText('카테고리')
    expect(within(select).getByRole('option', { name: '디자인 (숨김)' })).toBeInTheDocument()
    await userEvent.selectOptions(select, 'c1')
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards/b1/posts', expect.objectContaining({ category_id: 'c1' })),
    )
  })

  it('수정 — 분류 없음으로 바꾸면 null 을 보낸다', async () => {
    mockApi({
      postData: {
        id: 'p1',
        board_id: 'b1',
        title: '글',
        status: 'DRAFT',
        is_pinned: false,
        published_at: null,
        created_at: '2026-11-06T00:00:00Z',
        updated_at: '2026-11-06T00:00:00Z',
        deleted_at: null,
        body: [],
        custom_data: {},
        category_id: 'c1',
      },
    })
    patch.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderAt('/admin/boards/b1/posts/p1/edit', '/admin/boards/:boardId/posts/:postId/edit', <BoardPostEditPage />)
    const select = await screen.findByLabelText('카테고리')
    expect(select).toHaveValue('c1')
    await userEvent.selectOptions(select, '')
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/posts/p1', expect.objectContaining({ category_id: null })),
    )
  })

  it('카테고리가 없는 게시판은 고르는 칸이 없다', async () => {
    mockApi({ categories: [] })
    post.mockResolvedValue({ data: { data: { id: 'p1' } } })
    renderAt('/admin/boards/b1/posts/new', '/admin/boards/:boardId/posts/new', <BoardPostEditPage />)
    await userEvent.type(await screen.findByLabelText(/제목/), '글')
    expect(screen.queryByLabelText('카테고리')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards/b1/posts', expect.objectContaining({ category_id: null })),
    )
  })

  it('글 목록 — 카테고리로 걸러 보고 이름을 보여 준다', async () => {
    mockApi()
    get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/v1/boards') return ok([board])
      if (url.endsWith('/categories')) return ok([dev, design])
      if (url.endsWith('/fields')) return ok([])
      if (url.endsWith('/posts'))
        return ok({
          total: 1,
          page: 1,
          size: 20,
          items: [
            {
              id: 'p1',
              board_id: 'b1',
              title: '프론트엔드 채용',
              status: 'PUBLISHED',
              is_pinned: false,
              published_at: '2026-11-06T00:00:00Z',
              created_at: '2026-11-06T00:00:00Z',
              updated_at: '2026-11-06T00:00:00Z',
              deleted_at: null,
              custom_data: {},
              category_id: config?.params?.category_id ?? 'c1',
            },
          ],
        })
      return ok(null)
    })
    renderAt('/admin/boards/b1/posts', '/admin/boards/:boardId/posts', <BoardPostsPage />)
    expect(await screen.findByText('프론트엔드 채용')).toBeInTheDocument()
    await userEvent.selectOptions(await screen.findByLabelText('카테고리'), 'c1')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/v1/boards/b1/posts',
        expect.objectContaining({ params: expect.objectContaining({ category_id: 'c1' }) }),
      ),
    )
    const row = screen.getByText('프론트엔드 채용').closest('li')!
    expect(within(row).getByText('개발')).toBeInTheDocument()
  })
})
