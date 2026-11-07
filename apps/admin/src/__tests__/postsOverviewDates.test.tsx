import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { PostsOverviewPage } from '@/pages/PostsOverviewPage'
import { postDateFilters } from '@/lib/postDateFilters'
import { useAuthStore } from '@/stores/authStore'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const row = {
  id: 'p1',
  board_id: 'b1',
  board_name: '소식',
  title: '첫 글',
  status: 'PUBLISHED',
  updated_at: '2026-11-07T00:00:00Z',
}
const lastParams = () => get.mock.calls.filter(([url]) => url === '/v1/posts').at(-1)?.[1].params
const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <PostsOverviewPage />
    </MemoryRouter>
  )
const dates = (start: string, end: string) => {
  fireEvent.change(screen.getByLabelText('작성일 시작'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('작성일 종료'), { target: { value: end } })
}
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([{ id: 'b1', name: '소식', system_key: null }])
    if (url === '/v1/posts') return ok({ total: 21, page: 1, size: 20, items: [row] })
    return ok([])
  })
})

describe('전체 글 작성일 필터', () => {
  it('검색 전에는 적용하지 않고 제목과 기간을 함께 넘긴다', async () => {
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    dates('2026-11-01', '2026-11-07')
    expect(lastParams().created_from).toBeUndefined()
    await userEvent.type(screen.getByLabelText('제목 검색'), ' 행사 ')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        q: '행사',
        ...postDateFilters('2026-11-01', '2026-11-07'),
        page: 1,
      })
    )
  })
  it('잘못된 기간은 요청/글 선택을 바꾸지 않고 안내한다', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('checkbox', { name: '첫 글 선택' }))
    const requests = get.mock.calls.filter(([url]) => url === '/v1/posts').length
    dates('2026-11-08', '2026-11-07')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(screen.getByRole('alert')).toHaveTextContent('시작은 종료일보다 늦을 수 없습니다')
    expect(get.mock.calls.filter(([url]) => url === '/v1/posts')).toHaveLength(requests)
    expect(screen.getByRole('checkbox', { name: '첫 글 선택' })).toBeChecked()
  })
  it('기간 적용은 페이지와 선택을 초기화하고 게시판/상태 조건을 유지한다', async () => {
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    await userEvent.selectOptions(screen.getByLabelText('게시판'), 'b1')
    await userEvent.selectOptions(screen.getByLabelText('상태'), 'PRIVATE')
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await waitFor(() => expect(lastParams().page).toBe(2))
    await userEvent.click(screen.getByRole('checkbox', { name: '첫 글 선택' }))
    dates('2026-11-07', '2026-11-07')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        page: 1,
        board_id: 'b1',
        status: 'PRIVATE',
        ...postDateFilters('2026-11-07', '2026-11-07'),
      })
    )
    expect(screen.getByRole('checkbox', { name: '첫 글 선택' })).not.toBeChecked()
  })
  it('휴지통에서도 기간을 유지하고 기간 초기화는 다른 검색 조건을 남긴다', async () => {
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    dates('', '2026-11-07')
    await userEvent.type(screen.getByLabelText('제목 검색'), '행사')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await userEvent.click(screen.getByRole('button', { name: '휴지통 보기' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ trash: true, ...postDateFilters('', '2026-11-07') })
    )
    await userEvent.click(screen.getByRole('button', { name: '기간 초기화' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        trash: true,
        q: '행사',
        created_from: undefined,
        created_before: undefined,
      })
    )
    expect(screen.getByLabelText('작성일 종료')).toHaveValue('')
  })
  it('보기 전용도 날짜로 조회할 수 있다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    dates('2026-11-01', '')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(lastParams()).toMatchObject(postDateFilters('2026-11-01', '')))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('달력 날짜 변환', () => {
  it('하루와 윤년/월말의 종료 다음 날 자정까지 조회한다', () => {
    const filters = postDateFilters('2024-02-29', '2024-02-29')
    const start = new Date(filters.created_from!)
    const end = new Date(filters.created_before!)
    expect([start.getMonth(), start.getDate(), start.getHours()]).toEqual([1, 29, 0])
    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([2, 1, 0])
    expect(postDateFilters('', '')).toEqual({ created_from: undefined, created_before: undefined })
  })
  it.each(['2026-02-30', '2026-13-01', 'invalid', '0000-01-01'])(
    '잘못된 날짜 %s를 거부한다',
    (date) => {
      expect(() => postDateFilters(date, '')).toThrow()
    }
  )
  it.skipIf(new Date('2026-03-08T00:00:00').getTimezoneOffset() !== 300)(
    '서머타임 시작/종료일도 다음 자정을 사용한다 (뉴욕 TZ에서 실행)',
    () => {
      expect(postDateFilters('2026-03-08', '2026-03-08')).toEqual({
        created_from: '2026-03-08T05:00:00.000Z',
        created_before: '2026-03-09T04:00:00.000Z',
      })
      expect(postDateFilters('2026-11-01', '2026-11-01')).toEqual({
        created_from: '2026-11-01T04:00:00.000Z',
        created_before: '2026-11-02T05:00:00.000Z',
      })
    }
  )
})
