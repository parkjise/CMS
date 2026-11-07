import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import type { BoardCategory } from '@cms/types'
import { BoardCategoriesPage } from '@/pages/BoardCategoriesPage'
import { useAuthStore } from '@/stores/authStore'

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, patch } }))
const categories: BoardCategory[] = [
  { id: 'a', board_id: 'b1', name: 'News 소식', is_active: true, display_order: 0, post_count: 2 },
  { id: 'b', board_id: 'b1', name: '숨긴 소식', is_active: false, display_order: 1, post_count: 0 },
  { id: 'c', board_id: 'b1', name: '채용', is_active: true, display_order: 2, post_count: 1 },
]
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
const mockApi = (items = categories) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards')
      return ok([
        { id: 'b1', name: '게시판 하나', system_key: null },
        { id: 'b2', name: '게시판 둘', system_key: null },
      ])
    if (url.endsWith('/categories')) return ok(items)
    return ok([])
  })
const renderPage = (client = makeClient()) => {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/boards/b1/categories']}>
        <Link to="/admin/boards/b2/categories">다른 게시판</Link>
        <Routes>
          <Route path="/admin/boards/:boardId/categories" element={<BoardCategoriesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return client
}
const searchBox = () => screen.findByRole('searchbox', { name: '카테고리 이름 검색' })
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  mockApi()
})

describe('카테고리 검색', () => {
  it('이름 일부를 대소문자/앞뒤 공백과 관계없이 즉시 찾고 추가 조회하지 않는다', async () => {
    renderPage()
    const input = await searchBox()
    const calls = get.mock.calls.length
    await userEvent.type(input, '  nEwS  ')
    expect(screen.getByText(categories[0].name)).toBeInTheDocument()
    expect(screen.queryByText(categories[1].name)).not.toBeInTheDocument()
    expect(screen.getByText(/전체 \d+개 · 검색 결과 \d+개/)).toHaveTextContent(
      '전체 3개 · 검색 결과 1개'
    )
    expect(get).toHaveBeenCalledTimes(calls)
  })
  it('이름과 표시/숨김을 함께 적용하고 초기화하면 전체를 돌려준다', async () => {
    renderPage()
    await userEvent.type(await searchBox(), '소식')
    await userEvent.selectOptions(screen.getByLabelText('홈페이지 표시'), 'hidden')
    expect(screen.queryByText(categories[0].name)).not.toBeInTheDocument()
    expect(screen.getByText(categories[1].name)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('홈페이지 표시'), 'visible')
    expect(screen.getByText(categories[0].name)).toBeInTheDocument()
    expect(screen.queryByText(categories[1].name)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '검색 초기화' }))
    expect(await searchBox()).toHaveValue('')
    expect(screen.getByLabelText('홈페이지 표시')).toHaveValue('all')
    expect(screen.getByText(/전체 \d+개 · 검색 결과 \d+개/)).toHaveTextContent('검색 결과 3개')
  })
  it('검색 결과 없음과 카테고리 자체가 없는 상태를 구분한다', async () => {
    const client = renderPage()
    await userEvent.type(await searchBox(), '없는 이름')
    expect(screen.getByText(/검색 조건에 맞는 카테고리가 없습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/아직 카테고리가 없습니다/)).not.toBeInTheDocument()
    await act(async () => client.setQueryData(['boards', 'b1', 'categories'], []))
    expect(await screen.findByText(/아직 카테고리가 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
  it('검색 중 모든 순서 동작을 잠그고 초기화 후 전체 ID 순서를 보낸다', async () => {
    patch.mockResolvedValue({ data: { data: null } })
    renderPage()
    await userEvent.type(await searchBox(), '소식')
    for (const name of ['순서 끌기', '위로', '아래로']) {
      expect(screen.getByRole('button', { name: `${categories[0].name} ${name}` })).toBeDisabled()
    }
    expect(screen.getByText(/순서를 바꾸려면 검색 조건을 초기화/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `${categories[0].name} 아래로` }))
    expect(patch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '검색 초기화' }))
    await userEvent.click(screen.getByRole('button', { name: `${categories[0].name} 아래로` }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/order', {
        category_ids: ['b', 'a', 'c'],
      })
    )
  })
  it('상태 필터만 켜도 순서는 잠기며 합치기 대상은 필터 밖까지 유지한다', async () => {
    renderPage()
    await searchBox()
    await userEvent.selectOptions(screen.getByLabelText('홈페이지 표시'), 'hidden')
    expect(screen.getByRole('button', { name: `${categories[1].name} 위로` })).toBeDisabled()
    expect(screen.getByRole('button', { name: `${categories[1].name} 아래로` })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: `${categories[1].name} 합치기` }))
    const dialog = screen.getByRole('dialog', { name: '카테고리 합치기' })
    expect(within(dialog).getByRole('option', { name: categories[0].name })).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: categories[2].name })).toBeInTheDocument()
  })
  it('검색한 분류의 숨김 변경 후 조건을 유지하고 갱신 결과를 다시 거른다', async () => {
    patch.mockImplementation(() => {
      mockApi(categories.map((item) => ({ ...item, is_active: false })))
      return ok({ ...categories[0], is_active: false })
    })
    renderPage()
    await userEvent.type(await searchBox(), 'News')
    await userEvent.selectOptions(screen.getByLabelText('홈페이지 표시'), 'visible')
    await userEvent.click(screen.getByRole('button', { name: 'News 소식 숨기기' }))
    await screen.findByText(/검색 조건에 맞는 카테고리가 없습니다/)
    expect(await searchBox()).toHaveValue('News')
    expect(screen.getByLabelText('홈페이지 표시')).toHaveValue('visible')
    expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/a', { is_active: false })
  })
  it('필터 결과가 적어도 생성 한도는 전체 분류 수로 검사한다', async () => {
    mockApi(
      Array.from({ length: 30 }, (_, i) => ({ ...categories[0], id: String(i), name: `분류 ${i}` }))
    )
    renderPage()
    await userEvent.type(await searchBox(), '없는 이름')
    expect(screen.getByLabelText('새 카테고리')).toBeDisabled()
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled()
    expect(screen.getByText(/전체 \d+개 · 검색 결과 \d+개/)).toHaveTextContent(
      '전체 30개 · 검색 결과 0개'
    )
  })
  it('보기 전용은 검색할 수 있고 변경 동작은 보이지 않는다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderPage()
    await userEvent.type(await searchBox(), '소식')
    await userEvent.selectOptions(screen.getByLabelText('홈페이지 표시'), 'hidden')
    expect(screen.getByText(/전체 \d+개 · 검색 결과 \d+개/)).toHaveTextContent('검색 결과 1개')
    expect(
      screen.queryByRole('button', { name: /순서 끌기|위로|아래로|합치기|삭제|이름 바꾸기/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('새 카테고리')).not.toBeInTheDocument()
  })
  it('다른 게시판으로 이동하면 이전 검색 조건을 남기지 않는다', async () => {
    renderPage()
    await userEvent.type(await searchBox(), 'News')
    await userEvent.selectOptions(screen.getByLabelText('홈페이지 표시'), 'hidden')
    await userEvent.click(screen.getByRole('link', { name: '다른 게시판' }))
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
    expect(screen.getByLabelText('홈페이지 표시')).toHaveValue('all')
    expect(screen.getByText(/전체 \d+개 · 검색 결과 \d+개/)).toHaveTextContent('검색 결과 3개')
  })
})
