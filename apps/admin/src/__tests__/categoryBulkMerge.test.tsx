import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { BoardCategory } from '@cms/types'
import { BoardCategoriesPage } from '@/pages/BoardCategoriesPage'
import { BulkMergeCategoriesDialog } from '@/components/boards/BulkMergeCategoriesDialog'
import { useAuthStore } from '@/stores/authStore'

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, post } }))
vi.mock('@cms/ui', async (original) => ({ ...(await original<typeof import('@cms/ui')>()), toast }))
const a: BoardCategory = {
  id: 'a',
  board_id: 'b1',
  name: '원본 가',
  is_active: true,
  display_order: 0,
  post_count: 0,
}
const b: BoardCategory = { ...a, id: 'b', name: '원본 나', display_order: 1 }
const t: BoardCategory = { ...a, id: 't', name: '통합', display_order: 2, is_active: false }
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
const mockApi = (items = [a, b, t]) =>
  get.mockImplementation((url: string) =>
    url === '/v1/boards'
      ? ok([{ id: 'b1', name: '소식', system_key: null }])
      : ok(url.endsWith('/categories') ? items : [])
  )
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
const open = async () => {
  await userEvent.click(await screen.findByRole('button', { name: '여러 카테고리 합치기' }))
  return screen.getByRole('dialog', { name: '여러 카테고리 합치기' })
}
const choose = async (dialog: HTMLElement) => {
  await userEvent.click(within(dialog).getByRole('checkbox', { name: a.name }))
  await userEvent.click(within(dialog).getByRole('checkbox', { name: b.name }))
  await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
}
const submit = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: '선택한 카테고리 합치기' })
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  mockApi()
})

describe('여러 카테고리 합치기', () => {
  it('원본 둘과 대상 확인 뒤 한 번만 요청하고 게시판/전체 글 캐시를 갱신한다', async () => {
    const client = makeClient()
    const postsKey = ['boards', 'b1', 'posts']
    const overviewKey = ['boards', 'overview']
    const otherKey = ['boards', 'b2', 'posts']
    for (const key of [postsKey, overviewKey, otherKey]) client.setQueryData(key, [])
    post.mockImplementation(() => {
      mockApi([t])
      return ok({ merged: 2, moved: 4 })
    })
    renderPage(client)
    const dialog = await open()
    expect(submit(dialog)).toBeDisabled()
    await choose(dialog)
    expect(within(dialog).getByText(/휴지통 포함/)).toBeInTheDocument()
    expect(within(dialog).getByText(/홈페이지 분류 탭에서 숨겨져/)).toBeInTheDocument()
    expect(within(dialog).getByText(/원본 가, 원본 나 → 통합/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: a.name })).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(submit(dialog))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards/b1/categories/merge', {
        source_ids: ['a', 'b'],
        target_id: 't',
      })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(client.getQueryState(postsKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(overviewKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('카테고리 2개를 합치고 글 4개를 옮겼습니다.')
  })
  it('대상을 원본에 넣으면 대상 선택을 지우고 원본 하나로는 실행하지 않는다', async () => {
    renderPage()
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: a.name }))
    await userEvent.selectOptions(within(dialog).getByLabelText('합칠 대상'), 't')
    expect(submit(dialog)).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: b.name }))
    expect(submit(dialog)).toBeEnabled()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /통합/ }))
    expect(within(dialog).getByLabelText('합칠 대상')).toHaveValue('')
    expect(submit(dialog)).toBeDisabled()
  })
  it('실패 시 선택을 유지하고 같은 요청으로 재시도한다', async () => {
    post
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ data: { data: { merged: 2, moved: 0 } } })
    renderPage()
    const dialog = await open()
    await choose(dialog)
    await userEvent.click(submit(dialog))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(within(dialog).getByLabelText('합칠 대상')).toHaveValue('t')
    expect(within(dialog).getByRole('checkbox', { name: a.name })).toBeChecked()
    await userEvent.click(submit(dialog))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post).toHaveBeenCalledTimes(2)
  })
  it('처리 중 중복 요청/선택 변경/닫기를 막는다', async () => {
    let finish!: (value: unknown) => void
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    renderPage()
    const dialog = await open()
    await choose(dialog)
    await userEvent.click(submit(dialog))
    expect(within(dialog).getByRole('checkbox', { name: a.name })).toBeDisabled()
    expect(within(dialog).getByLabelText('합칠 대상')).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
    await act(async () => finish({ data: { data: { merged: 2, moved: 1 } } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('취소 후 다시 열면 원본/대상 선택을 초기화한다', async () => {
    renderPage()
    const dialog = await open()
    await choose(dialog)
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    const next = await open()
    expect(within(next).getByRole('checkbox', { name: a.name })).not.toBeChecked()
    expect(within(next).getByLabelText('합칠 대상')).toHaveValue('')
    expect(post).not.toHaveBeenCalled()
  })
  it('화면 검색 밖의 분류도 선택 화면에서 제공한다', async () => {
    renderPage()
    await userEvent.type(await screen.findByRole('searchbox'), '원본 가')
    const dialog = await open()
    expect(within(dialog).getByRole('checkbox', { name: b.name })).toBeInTheDocument()
    await choose(dialog)
    expect(submit(dialog)).toBeEnabled()
  })
  it('분류 부족은 비활성화하고 보기 전용은 버튼을 숨긴다', async () => {
    mockApi([a, b])
    const view = renderPage()
    expect(await screen.findByRole('button', { name: '여러 카테고리 합치기' })).toBeDisabled()
    view.unmount()
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    mockApi()
    renderPage()
    await screen.findByText(a.name)
    expect(screen.queryByRole('button', { name: '여러 카테고리 합치기' })).not.toBeInTheDocument()
  })
  it('선택 중 원본이 사라지면 일부만 요청하지 않고 다시 선택하도록 안내한다', async () => {
    const client = makeClient()
    renderPage(client)
    const dialog = await open()
    await choose(dialog)
    await act(async () => client.setQueryData(['boards', 'b1', 'categories'], [a, t]))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '선택한 카테고리가 바뀌었습니다'
    )
    expect(submit(dialog)).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })
  it('다른 게시판을 제외하고 원본은 최대 29개만 고를 수 있다', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ ...a, id: String(i), name: `분류 ${i}` }))
    render(
      <QueryClientProvider client={makeClient()}>
        <BulkMergeCategoriesDialog
          boardId="b1"
          categories={[...items, { ...b, board_id: 'b2', name: '외부' }]}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    )
    expect(screen.queryByRole('checkbox', { name: '외부' })).not.toBeInTheDocument()
    for (let i = 0; i < 29; i++)
      fireEvent.click(screen.getByRole('checkbox', { name: `분류 ${i}` }))
    expect(screen.getByRole('checkbox', { name: '분류 29' })).toBeDisabled()
    expect(screen.getByRole('option', { name: '분류 29' })).toBeInTheDocument()
  })
})
