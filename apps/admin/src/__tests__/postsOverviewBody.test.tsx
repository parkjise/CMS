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

describe('전체 글 본문 검색', () => {
  it('입력만으로 조회하지 않고 검색 시 본문을 다듬어 제목·기간과 함께 적용한다', async () => {
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    const count = get.mock.calls.filter(([url]) => url === '/v1/posts').length
    await userEvent.type(screen.getByLabelText('본문 검색'), ' 본문문구 ')
    expect(get.mock.calls.filter(([url]) => url === '/v1/posts')).toHaveLength(count)
    await userEvent.type(screen.getByLabelText('제목 검색'), ' 소식 ')
    fireEvent.change(screen.getByLabelText('회원·비회원 작성자 검색'), {
      target: { value: '김작가' },
    })
    dates('2026-11-01', '')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        body_q: '본문문구',
        author: '김작가',
        q: '소식',
        ...postDateFilters('2026-11-01', ''),
        page: 1,
      })
    )
  })
  it('휴지통 검색은 페이지·선택을 비우며 게시판과 휴지통을 유지한다', async () => {
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    await userEvent.selectOptions(screen.getByLabelText('게시판'), 'b1')
    await userEvent.selectOptions(screen.getByLabelText('상태'), 'PRIVATE')
    await userEvent.click(screen.getByRole('button', { name: '휴지통 보기' }))
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await waitFor(() => expect(lastParams().page).toBe(2))
    await userEvent.click(screen.getByRole('checkbox', { name: '첫 글 선택' }))
    fireEvent.change(screen.getByLabelText('본문 검색'), {
      target: { value: '검색어' },
    })
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        body_q: '검색어',
        board_id: 'b1',
        status: undefined,
        trash: true,
        page: 1,
      })
    )
    expect(screen.getByRole('checkbox', { name: '첫 글 선택' })).not.toBeChecked()
  })
  it('빈 본문으로 다시 검색하면 작성자만 해제하고 기간 초기화는 본문을 남긴다', async () => {
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    fireEvent.change(screen.getByLabelText('본문 검색'), {
      target: { value: '본문문구' },
    })
    await userEvent.type(screen.getByLabelText('제목 검색'), '소식')
    dates('2026-11-01', '')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(lastParams().body_q).toBe('본문문구'))
    await userEvent.click(screen.getByRole('button', { name: '기간 초기화' }))
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ body_q: '본문문구', created_from: undefined })
    )
    fireEvent.change(screen.getByLabelText('본문 검색'), { target: { value: '  ' } })
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ body_q: undefined, q: '소식' }))
  })
  it('잘못된 날짜는 본문도 적용하지 않으며 보기 전용도 정상 검색할 수 있다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderPage()
    await screen.findByRole('link', { name: '첫 글' })
    fireEvent.change(screen.getByLabelText('본문 검색'), {
      target: { value: '본문문구' },
    })
    expect(screen.getByLabelText('본문 검색')).toHaveAttribute('maxlength', '100')
    dates('2026-11-08', '2026-11-07')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(lastParams().body_q).toBeUndefined()
    dates('', '')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(lastParams().body_q).toBe('본문문구'))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
