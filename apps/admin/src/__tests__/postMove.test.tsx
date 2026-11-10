import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { PostMoveDialog } from '@/components/boards/PostMoveDialog'
import { PostsOverviewPage } from '@/pages/PostsOverviewPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, post } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const BOARDS = [
  { id: 'b1', name: '병원 소식', system_key: null, status: 'ACTIVE' },
  { id: 'b2', name: '채용 공고', system_key: null, status: 'ACTIVE' },
  { id: 'notice', name: '공지사항', system_key: 'notice', status: 'ACTIVE' },
]

const PREVIEW = {
  posts: 2,
  target_name: '채용 공고',
  carried: [{ label: '근무지', posts: 2 }],
  dropped: [{ label: '촬영일', posts: 1 }],
  blocked_count: 0,
  blocked: [],
}

const mockApi = (preview: unknown = PREVIEW) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(BOARDS)
    if (url === '/v1/boards/b2/categories')
      return ok([{ id: 'c1', name: '정규직', is_active: true, parent_id: null }])
    if (url === '/v1/posts')
      return ok({
        total: 1,
        page: 1,
        size: 20,
        items: [
          {
            id: 'p1',
            board_id: 'b1',
            board_name: '병원 소식',
            title: '첫 글',
            status: 'PUBLISHED',
            is_pinned: false,
            published_at: null,
            created_at: '2026-11-05T00:00:00Z',
            updated_at: '2026-11-05T00:00:00Z',
            deleted_at: null,
          },
        ],
      })
    return ok(undefined)
  })
  post.mockImplementation((url: string) => {
    if (url === '/v1/posts/move/preview') return ok(preview)
    if (url === '/v1/posts/move') return ok({ moved: 2, values_dropped: 1 })
    return ok(undefined)
  })
}

const renderDialog = (props: Partial<Parameters<typeof PostMoveDialog>[0]> = {}) => {
  const onMoved = vi.fn()
  const onClose = vi.fn()
  renderWithQuery(
    <PostMoveDialog
      postIds={['p1', 'p2']}
      fromBoardId="b1"
      onClose={onClose}
      onMoved={onMoved}
      {...props}
    />
  )
  return { onMoved, onClose }
}

const pickBoard = async (name: string) =>
  userEvent.selectOptions(await screen.findByLabelText('받을 게시판'), name)

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('다른 게시판으로 옮기기 (T-184)', () => {
  it('지금 게시판은 받을 곳에서 빠진다', async () => {
    mockApi()
    renderDialog()
    await screen.findByRole('option', { name: '채용 공고' })
    expect(screen.queryByRole('option', { name: '병원 소식' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '옮기기' })).toBeDisabled()
  })

  it('게시판을 고르면 미리보기 — 따라가는 값 · 빠지는 값', async () => {
    mockApi()
    renderDialog()
    await pickBoard('채용 공고')
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/move/preview', {
        post_ids: ['p1', 'p2'],
        target_board_id: 'b2',
        category_id: null,
      })
    )
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('글 2개를 ‘채용 공고’(으)로 옮깁니다.')
    expect(status).toHaveTextContent('따라가는 칸 값: 근무지(2개)')
    expect(status).toHaveTextContent('빠지는 값: 촬영일(1개)')
    expect(screen.getByRole('button', { name: '옮기기' })).toBeEnabled()
  })

  it('분류를 골라 옮긴다', async () => {
    mockApi()
    const { onMoved } = renderDialog()
    await pickBoard('채용 공고')
    await userEvent.selectOptions(await screen.findByLabelText('분류'), '정규직')
    await screen.findByRole('status')
    await userEvent.click(screen.getByRole('button', { name: '옮기기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/move', {
        post_ids: ['p1', 'p2'],
        target_board_id: 'b2',
        category_id: 'c1',
      })
    )
    expect(toast.success).toHaveBeenCalledWith("글 2개를 '채용 공고'(으)로 옮겼습니다.")
    expect(onMoved).toHaveBeenCalledWith({ moved: 2, values_dropped: 1 }, 'b2')
  })

  it('공지에는 분류가 없다', async () => {
    mockApi()
    renderDialog()
    await pickBoard('공지사항')
    await screen.findByRole('status')
    expect(screen.queryByLabelText('분류')).not.toBeInTheDocument()
  })

  it('옮길 수 없는 글이 있으면 이유를 보여 주고 옮기지 않는다', async () => {
    mockApi({
      ...PREVIEW,
      blocked_count: 1,
      blocked: [{ post_id: 'p1', title: '비밀 글', reason: '비밀글은 공지로 옮길 수 없습니다.' }],
    })
    renderDialog()
    await pickBoard('공지사항')
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('옮길 수 없는 글이 1개 있습니다.')
    expect(
      within(status).getByText('비밀 글 — 비밀글은 공지로 옮길 수 없습니다.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '옮기기' })).toBeDisabled()
  })

  it('실패하면 알리고 창을 닫지 않는다', async () => {
    mockApi()
    const { onMoved } = renderDialog()
    post.mockImplementation((url: string) =>
      url === '/v1/posts/move' ? Promise.reject(new Error('boom')) : ok(PREVIEW)
    )
    await pickBoard('채용 공고')
    await screen.findByRole('status')
    await userEvent.click(screen.getByRole('button', { name: '옮기기' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onMoved).not.toHaveBeenCalled()
  })

  it('전체 글 화면 — 고른 글을 옮기고 선택을 비운다', async () => {
    mockApi({ ...PREVIEW, posts: 1 })
    post.mockImplementation((url: string) =>
      url === '/v1/posts/move' ? ok({ moved: 1, values_dropped: 0 }) : ok({ ...PREVIEW, posts: 1 })
    )
    renderWithQuery(
      <MemoryRouter>
        <PostsOverviewPage />
      </MemoryRouter>
    )
    await userEvent.click(await screen.findByLabelText('첫 글 선택'))
    await userEvent.click(screen.getByRole('button', { name: '다른 게시판으로' }))
    await pickBoard('채용 공고')
    await screen.findByRole('status')
    await userEvent.click(screen.getByRole('button', { name: '옮기기' }))
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: '선택한 글 처리' })).not.toBeInTheDocument()
    )
    expect(post).toHaveBeenCalledWith('/v1/posts/move', {
      post_ids: ['p1'],
      target_board_id: 'b2',
      category_id: null,
    })
  })
})
