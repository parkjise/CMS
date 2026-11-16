import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, PostListItem } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardTrashPage } from '@/pages/BoardTrashPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { purgeLabel, trashNote } from '@/lib/trash'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, post, patch, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const ok = (data: unknown) => Promise.resolve({ data: { data } })
const inDays = (days: number) => dayjs().add(days, 'day').add(1, 'hour').toISOString()

const trashed = {
  id: 'b9',
  name: '옛 소식',
  slug: 'old-news',
  status: 'ACTIVE',
  system_key: null,
  post_count: 3,
  deleted_at: '2026-11-01T00:00:00Z',
  purge_at: inDays(12),
  deleted_by: 'admin@test.com',
} as Board

const board = {
  id: 'b1',
  name: '소식',
  slug: 'news',
  status: 'ACTIVE',
  system_key: null,
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
} as Board

const trashedPost: PostListItem = {
  id: 'p1',
  board_id: 'b1',
  title: '지운 글',
  status: 'PUBLISHED',
  is_pinned: false,
  published_at: '2026-11-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  deleted_at: '2026-11-05T00:00:00Z',
  purge_at: inDays(3),
  deleted_by: 'admin@test.com',
}

const confirm = vi.spyOn(window, 'confirm')

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  del.mockResolvedValue({ data: { data: { purged: true } } })
})

afterEach(() => confirm.mockReset())

const renderTrash = () =>
  renderWithQuery(
    <MemoryRouter>
      <BoardTrashPage />
    </MemoryRouter>
  )

describe('휴지통 30일 · 영구 삭제 (T-196)', () => {
  it('게시판 휴지통에 남은 기간 · 지운 사람을 보여 준다', async () => {
    get.mockImplementation(() => ok([trashed]))
    renderTrash()
    const row = (await screen.findByText('옛 소식')).closest('tr') as HTMLElement
    expect(within(row).getByText('12일 뒤 영구 삭제')).toBeInTheDocument()
    expect(within(row).getByText('admin@test.com')).toBeInTheDocument()
  })

  it('확인하면 게시판을 영구 삭제하고, 취소하면 아무것도 하지 않는다', async () => {
    get.mockImplementation(() => ok([trashed]))
    renderTrash()
    const button = await screen.findByRole('button', { name: '영구 삭제' })

    confirm.mockReturnValueOnce(false)
    await userEvent.click(button)
    expect(del).not.toHaveBeenCalled()

    confirm.mockReturnValueOnce(true)
    await userEvent.click(button)
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/boards/b9/permanent'))
    expect(toast.success).toHaveBeenCalledWith('게시판을 영구 삭제했습니다.')
  })

  it('보기 전용 계정은 영구 삭제 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    get.mockImplementation(() => ok([trashed]))
    renderTrash()
    await screen.findByText('옛 소식')
    expect(screen.queryByRole('button', { name: '영구 삭제' })).not.toBeInTheDocument()
  })

  it('휴지통 글도 남은 기간을 보이고 영구 삭제할 수 있다', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/v1/boards') return ok([board])
      if (url.endsWith('/posts')) return ok({ total: 1, page: 1, size: 20, items: [trashedPost] })
      return ok([])
    })
    confirm.mockReturnValueOnce(true)
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards/b1/posts']}>
        <Routes>
          <Route path="/admin/boards/:boardId/posts" element={<BoardPostsPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('3일 뒤 영구 삭제 · admin@test.com 삭제')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '영구 삭제' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/boards/b1/posts/p1/permanent'))
  })

  it('남은 기간 문구', () => {
    expect(purgeLabel({ purge_at: null })).toBeNull()
    expect(purgeLabel({ purge_at: dayjs().subtract(1, 'hour').toISOString() })).toBe('곧 영구 삭제')
    expect(trashNote({ purge_at: dayjs().add(30, 'day').toISOString() })).toBe('30일 뒤 영구 삭제')
  })
})

describe('휴지통 [글] 탭 — 한 곳에서 (T-209)', () => {
  const posts = [
    { ...trashedPost, board_name: '소식' },
    { ...trashedPost, id: 'p2', title: '두 번째 글', board_name: '갤러리' },
  ]
  const renderPostsTab = () =>
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards/trash?tab=posts']}>
        <Routes>
          <Route path="/admin/boards/trash" element={<BoardTrashPage />} />
        </Routes>
      </MemoryRouter>
    )

  beforeEach(() => {
    get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/v1/posts') {
        expect(config?.params).toMatchObject({ trash: true, page: 1 })
        return ok({ total: 2, page: 1, size: 20, items: posts })
      }
      return ok([trashed])
    })
    post.mockImplementation((url: string, body: { post_ids: string[] }) =>
      ok(
        url === '/v1/posts/purge'
          ? { purged: body.post_ids.length }
          : { updated: body.post_ids.length }
      )
    )
  })

  it('모든 게시판의 지운 글을 게시판 이름 · 남은 기간과 보여 준다', async () => {
    renderPostsTab()
    const row = (await screen.findByText('두 번째 글')).closest('tr') as HTMLElement
    expect(within(row).getByText('갤러리')).toBeInTheDocument()
    expect(within(row).getByText('3일 뒤 영구 삭제')).toBeInTheDocument()
    expect(screen.getByText('삭제된 글 (2)')).toBeInTheDocument()
  })

  it('탭을 바꾸면 게시판 휴지통이 보인다', async () => {
    renderPostsTab()
    await screen.findByText('두 번째 글')
    await userEvent.click(screen.getByRole('button', { name: '게시판' }))
    expect(await screen.findByText('옛 소식')).toBeInTheDocument()
  })

  it('선택 영구 삭제는 개수를 확인하고 한 번에 보낸다', async () => {
    renderPostsTab()
    await screen.findByText('두 번째 글')
    await userEvent.click(screen.getByRole('checkbox', { name: '이 쪽 글 모두 선택' }))
    confirm.mockReturnValueOnce(true)
    await userEvent.click(screen.getByRole('button', { name: '선택 영구 삭제 (2)' }))
    expect(confirm).toHaveBeenCalledWith('글 2개를 영구 삭제할까요? 되돌릴 수 없습니다.')
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/purge', { post_ids: ['p1', 'p2'] })
    )
    expect(toast.success).toHaveBeenCalledWith('글 2개를 영구 삭제했습니다.')
  })

  it('행 [복원]은 RESTORE 로, 확인을 취소한 영구 삭제는 보내지 않는다', async () => {
    renderPostsTab()
    const row = (await screen.findByText('지운 글')).closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: '복원' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/bulk', { post_ids: ['p1'], action: 'RESTORE' })
    )
    confirm.mockReturnValueOnce(false)
    await userEvent.click(within(row).getByRole('button', { name: '영구 삭제' }))
    expect(post).not.toHaveBeenCalledWith('/v1/posts/purge', expect.anything())
  })

  it('보기 전용은 선택 · 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderPostsTab()
    await screen.findByText('두 번째 글')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '영구 삭제' })).not.toBeInTheDocument()
  })
})
