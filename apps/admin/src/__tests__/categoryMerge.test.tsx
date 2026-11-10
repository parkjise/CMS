import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { BoardCategory } from '@cms/types'
import { PostsOverviewPage } from '@/pages/PostsOverviewPage'
import { BoardCategoriesPage } from '@/pages/BoardCategoriesPage'
import { MergeCategoryDialog } from '@/components/boards/MergeCategoryDialog'
import { useAuthStore } from '@/stores/authStore'

const { get, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, delete: del } }))
vi.mock('@cms/ui', async (original) => ({ ...(await original<typeof import('@cms/ui')>()), toast }))
const source: BoardCategory = {
  id: 's',
  board_id: 'b1',
  name: '이전 소식',
  is_active: true,
  display_order: 0,
  post_count: 0,
}
const target: BoardCategory = { ...source, id: 't', name: '통합 소식', post_count: 3 }
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
const renderPage = (client = makeClient()) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/boards/b1/categories']}>
        <Routes>
          <Route path="/admin/boards/:boardId/categories" element={<BoardCategoriesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
const mockApi = (categories = [source, target]) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/posts') return ok({ total: 0, page: 1, size: 20, items: [] })
    if (url === '/v1/boards') return ok([{ id: 'b1', name: '소식', system_key: null }])
    if (url.endsWith('/categories')) return ok(categories)
    return ok([])
  })
const openMerge = async (name = source.name) => {
  await userEvent.click(await screen.findByRole('button', { name: `${name} 합치기` }))
  return screen.getByRole('dialog', { name: '카테고리 합치기' })
}
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('카테고리 합치기', () => {
  it('대상을 선택하고 확인해야 기존 삭제/이동 API를 호출한다. 휴지통만 있는 분류도 처리한다', async () => {
    mockApi()
    del.mockImplementation(() => {
      mockApi([target])
      return ok({ moved: 2 })
    })
    renderPage()
    const dialog = await openMerge()
    expect(within(dialog).getByText(/휴지통의 글도 함께 옮깁니다/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: source.name })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '합치기' })).toBeDisabled()
    expect(del).not.toHaveBeenCalled()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    expect(within(dialog).getByText(/이전 소식.*→.*통합 소식/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '합치기' }))
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith('/v1/boards/b1/categories/s', { params: { move_to: 't' } })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: `${source.name} 합치기` })).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('카테고리를 합치고 글 2개를 옮겼습니다.')
  })
  it('숨긴 대상으로 합치면 홈페이지 탭 영향을 안내한다', async () => {
    mockApi([source, { ...target, is_active: false }])
    renderPage()
    const dialog = await openMerge()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    expect(
      within(dialog).getByRole('option', { name: /통합 소식.*홈페이지에서 숨김/ })
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/대상 카테고리는 홈페이지 분류 탭에서 숨겨져/)
    ).toBeInTheDocument()
  })
  it('취소 후 다시 열면 이전 대상 선택을 남기지 않는다', async () => {
    mockApi()
    renderPage()
    const dialog = await openMerge()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    const reopened = await openMerge()
    expect(within(reopened).getByLabelText('합칠 대상')).toHaveValue('')
    expect(del).not.toHaveBeenCalled()
  })
  it('서버 실패 시 분류와 대상 선택을 유지하고 재시도할 수 있다', async () => {
    mockApi()
    del
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue({ data: { data: { moved: 0 } } })
    renderPage()
    const dialog = await openMerge()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    await userEvent.click(within(dialog).getByRole('button', { name: '합치기' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(within(dialog).getByLabelText('합칠 대상')).toHaveValue('t')
    expect(screen.getByRole('button', { name: `${source.name} 합치기` })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '합치기' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(del).toHaveBeenCalledTimes(2)
  })
  it('처리 중에는 중복 요청 · 닫기 · 대상 변경을 막는다', async () => {
    mockApi()
    let done!: (value: unknown) => void
    del.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve
        })
    )
    renderPage()
    const dialog = await openMerge()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    await userEvent.click(within(dialog).getByRole('button', { name: '합치기' }))
    expect(within(dialog).getByLabelText('합칠 대상')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()
    expect(del).toHaveBeenCalledTimes(1)
    await act(async () => done({ data: { data: { moved: 2 } } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('분류가 하나면 비활성화하고 보기 전용에는 작업을 숨긴다', async () => {
    mockApi([source])
    const first = renderPage()
    expect(await screen.findByRole('button', { name: `${source.name} 합치기` })).toBeDisabled()
    first.unmount()
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    mockApi()
    renderPage()
    await screen.findByText(source.name)
    expect(screen.queryByRole('button', { name: /합치기/ })).not.toBeInTheDocument()
  })
  it('게시판별 글과 전체 글 캐시를 함께 무효화한다', async () => {
    mockApi()
    del.mockResolvedValue({ data: { data: { moved: 2 } } })
    const client = makeClient()
    const postsKey = ['boards', 'b1', 'posts', { page: 1 }]
    const overviewKey = ['boards', 'overview', { page: 1 }]
    const unrelatedKey = ['boards', 'b2', 'posts']
    for (const key of [postsKey, overviewKey, unrelatedKey]) client.setQueryData(key, [])
    renderPage(client)
    const dialog = await openMerge()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    await userEvent.click(within(dialog).getByRole('button', { name: '합치기' }))
    await waitFor(() => expect(client.getQueryState(overviewKey)?.isInvalidated).toBe(true))
    expect(client.getQueryState(postsKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false)
  })
  it('전체 글에서 합쳐져 사라진 카테고리 조건은 해제한다', async () => {
    mockApi()
    del.mockImplementation(() => {
      mockApi([target])
      return ok({ moved: 2 })
    })
    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter initialEntries={['/admin/boards/b1/categories']}>
          <PostsOverviewPage />
          <Routes>
            <Route path="/admin/boards/:boardId/categories" element={<BoardCategoriesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await within(screen.getByLabelText('게시판')).findByRole('option', { name: '소식' })
    await userEvent.selectOptions(screen.getByLabelText('게시판'), 'b1')
    await userEvent.selectOptions(screen.getByLabelText('카테고리'), 's')
    await waitFor(() =>
      expect(
        get.mock.calls.filter(([url]) => url === '/v1/posts').at(-1)?.[1].params.category_id
      ).toBe('s')
    )
    const dialog = await openMerge()
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    await userEvent.click(within(dialog).getByRole('button', { name: '합치기' }))
    await waitFor(() => expect(screen.getByLabelText('카테고리')).toHaveValue(''))
    await waitFor(() =>
      expect(
        get.mock.calls.filter(([url]) => url === '/v1/posts').at(-1)?.[1].params.category_id
      ).toBeUndefined()
    )
  })
  it('다른 게시판 분류는 합칠 대상으로 제공하지 않는다', () => {
    const foreign = { ...target, id: 'foreign', board_id: 'b2', name: '다른 게시판' }
    render(
      <QueryClientProvider client={makeClient()}>
        <MergeCategoryDialog
          boardId="b1"
          source={source}
          categories={[source, target, foreign]}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    )
    expect(screen.queryByRole('option', { name: foreign.name })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: target.name })).toBeInTheDocument()
  })
})
