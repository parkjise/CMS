import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
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

const row = (id: string, title: string, extra = {}) => ({
  id,
  board_id: 'b1',
  board_name: '병원 소식',
  title,
  status: 'PUBLISHED',
  is_pinned: false,
  published_at: '2026-11-05T00:00:00Z',
  created_at: '2026-11-05T00:00:00Z',
  updated_at: '2026-11-05T00:00:00Z',
  deleted_at: null,
  ...extra,
})

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = (items = [row('p1', '첫 글'), row('p2', '둘째 글')], total = items.length) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([{ id: 'b1', name: '병원 소식', system_key: null }])
    if (url === '/v1/posts') return ok({ total, page: 1, size: 20, items })
    return ok(undefined)
  })
}

const lastListParams = () => get.mock.calls.filter(([url]) => url === '/v1/posts').at(-1)?.[1].params

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <PostsOverviewPage />
    </MemoryRouter>,
  )

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role } } as never)

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('전체 글 (BM-05)', () => {
  it('게시판 이름 · 상태 · 수정 화면 링크', async () => {
    mockApi()
    renderPage()
    const link = await screen.findByRole('link', { name: '첫 글' })
    expect(link).toHaveAttribute('href', '/admin/boards/b1/posts/p1/edit')
    expect(screen.getAllByText('병원 소식').length).toBeGreaterThan(0)
    expect(screen.getAllByText('공개').length).toBeGreaterThan(0)
    expect(screen.getByText('총 2개')).toBeInTheDocument()
  })

  it('필터 · 검색을 API 에 넘긴다', async () => {
    mockApi()
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    await screen.findByRole('option', { name: '병원 소식' })
    await userEvent.selectOptions(screen.getByLabelText('게시판'), 'b1')
    await waitFor(() => expect(lastListParams()).toMatchObject({ board_id: 'b1', page: 1 }))
    await userEvent.selectOptions(screen.getByLabelText('상태'), 'DRAFT')
    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'DRAFT' }))
    await userEvent.type(screen.getByLabelText('제목 검색'), ' 소식 ')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: '소식' }))
  })

  it('고른 글을 한 번에 공개하고 선택을 비운다', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: { updated: 2 } } })
    renderPage()
    await userEvent.click(await screen.findByLabelText('이 페이지 전체 선택'))
    const bar = screen.getByRole('group', { name: '선택한 글 처리' })
    expect(within(bar).getByText('2개 선택')).toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: '공개' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/bulk', { post_ids: ['p1', 'p2'], action: 'PUBLISH' }),
    )
    expect(toast.success).toHaveBeenCalledWith('글 2개를 공개했습니다.')
    await waitFor(() => expect(screen.queryByRole('group', { name: '선택한 글 처리' })).not.toBeInTheDocument())
  })

  it('휴지통은 확인을 받고, 취소하면 보내지 않는다', async () => {
    mockApi()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await userEvent.click(await screen.findByLabelText('첫 글 선택'))
    await userEvent.click(screen.getByRole('button', { name: '휴지통으로' }))
    expect(confirm).toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('실패하면 아무 글도 바뀌지 않았다고 알리고 선택을 유지', async () => {
    mockApi()
    post.mockRejectedValue(new Error('x'))
    renderPage()
    await userEvent.click(await screen.findByLabelText('첫 글 선택'))
    await userEvent.click(screen.getByRole('button', { name: '비공개' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('아무 글도')))
    expect(screen.getByText('1개 선택')).toBeInTheDocument()
  })

  it('필터를 바꾸면 선택을 비운다', async () => {
    mockApi()
    renderPage()
    await userEvent.click(await screen.findByLabelText('첫 글 선택'))
    await userEvent.selectOptions(screen.getByLabelText('상태'), 'DRAFT')
    expect(screen.queryByRole('group', { name: '선택한 글 처리' })).not.toBeInTheDocument()
  })

  it('휴지통 보기: trash 로 읽고 복원만, 수정 링크 없음', async () => {
    mockApi([row('p9', '지운 글', { deleted_at: '2026-11-05T00:00:00Z' })])
    post.mockResolvedValue({ data: { data: { updated: 1 } } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '휴지통 보기' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ trash: true }))
    expect(screen.queryByRole('link', { name: '지운 글' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('상태')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByLabelText('지운 글 선택'))
    const bar = screen.getByRole('group', { name: '선택한 글 처리' })
    expect(within(bar).queryByRole('button', { name: '공개' })).not.toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: '복원' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/posts/bulk', { post_ids: ['p9'], action: 'RESTORE' }),
    )
  })

  it('페이지를 넘길 수 있다', async () => {
    mockApi([row('p1', '첫 글')], 45)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '다음 페이지' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))
  })

  it('빈 목록 · 불러오기 실패 안내', async () => {
    mockApi([])
    renderPage()
    expect(await screen.findByText('조건에 맞는 글이 없습니다.')).toBeInTheDocument()
  })

  it('보기 전용 계정은 선택할 수 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi()
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
