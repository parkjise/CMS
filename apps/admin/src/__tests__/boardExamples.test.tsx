import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardsPage } from '@/pages/BoardsPage'
import { BoardNewPage } from '@/pages/BoardNewPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, post } }))

const notice: Partial<Board> = {
  id: 'notice',
  name: '공지사항',
  slug: 'notice',
  system_key: 'notice',
  board_type: 'LIST',
  status: 'ACTIVE',
  post_count: 0,
  updated_at: '2026-11-07T00:00:00Z',
}
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const mockApi = ({ boards = [notice], canCreate = true } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url === '/v1/boards/limits')
      return ok({ can_create: canCreate, reason: canCreate ? null : '게시판 한도입니다.' })
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code', items: [] })
    return ok(undefined)
  })
}
const renderPage = (path = '/admin/boards') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/boards" element={<BoardsPage />} />
        <Route path="/admin/boards/new" element={<BoardNewPage />} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never, tenantSlug: 'clinic' })
})

describe('게시판 예시 안내 (T-157)', () => {
  it.each([true, false])(
    '기본 게시판만 있거나 완전히 비었으면 안내한다 (기본 공지: %s)',
    async (withNotice) => {
      mockApi({ boards: withNotice ? [notice] : [] })
      renderPage()
      await screen.findByRole('heading', { name: '이런 게시판으로 시작해 보세요' })
      expect(await screen.findByRole('link', { name: '사진 모음 예시로 시작' })).toHaveAttribute(
        'href',
        '/admin/boards/new?example=photos'
      )
      expect(screen.getByRole('heading', { name: '소식' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '자주 묻는 질문' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '채용 안내' })).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    }
  )

  it('추가 게시판이 있으면 검색 결과가 없어도 첫 생성 안내를 보여 주지 않는다', async () => {
    mockApi({ boards: [{ ...notice, system_key: null, slug: 'news' }] })
    renderPage('/admin/boards?q=없는이름')
    await screen.findByText('검색 조건에 맞는 게시판이 없습니다.')
    expect(
      screen.queryByRole('heading', { name: '이런 게시판으로 시작해 보세요' })
    ).not.toBeInTheDocument()
  })

  it('보기 전용은 예시를 볼 수 있지만 생성 링크는 없다', async () => {
    mockApi()
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } as never })
    renderPage()
    await screen.findByRole('heading', { name: '이런 게시판으로 시작해 보세요' })
    expect(screen.queryByRole('link', { name: /예시로 시작/ })).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('요금제 한도 초과 시 안내만 보여 준다', async () => {
    mockApi({ canCreate: false })
    renderPage()
    await screen.findByRole('heading', { name: '이런 게시판으로 시작해 보세요' })
    await screen.findByText('게시판 한도입니다.')
    expect(screen.queryByRole('link', { name: /예시로 시작/ })).not.toBeInTheDocument()
  })

  it('한도를 확인하지 못하면 생성 링크를 두지 않는다', async () => {
    mockApi()
    const original = get.getMockImplementation()!
    get.mockImplementation((url: string) =>
      url === '/v1/boards/limits' ? Promise.reject(new Error('x')) : original(url)
    )
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByRole('link', { name: /예시로 시작/ })).not.toBeInTheDocument()
  })

  it.each([
    ['news', '소식', '목록형'],
    ['photos', '사진 모음', '갤러리형'],
    ['faq', '자주 묻는 질문', 'FAQ형'],
    ['jobs', '채용 안내', '카드형'],
  ])(
    '%s 예시 주소에서 이름 · 설명 · 유형을 채우고 저장 요청은 하지 않는다',
    async (id, name, type) => {
      mockApi()
      renderPage(`/admin/boards/new?example=${id}`)
      expect(await screen.findByLabelText(/게시판 이름/)).toHaveValue(name)
      expect(screen.getByLabelText('설명 (선택)')).not.toHaveValue('')
      await userEvent.click(screen.getByRole('button', { name: '다음' }))
      expect(screen.getByRole('radio', { name: new RegExp(type) })).toBeChecked()
      expect(post).not.toHaveBeenCalled()
    }
  )

  it('알 수 없는 예시나 임의 입력 쿼리는 기본 빈 폼으로 시작한다', async () => {
    mockApi()
    renderPage('/admin/boards/new?example=unknown&name=임의이름&board_type=GALLERY')
    expect(await screen.findByLabelText(/게시판 이름/)).toHaveValue('')
    expect(screen.getByLabelText('설명 (선택)')).toHaveValue('')
    expect(post).not.toHaveBeenCalled()
  })

  it('목록에서 예시를 골라 내용을 바꾸고 만들기를 눌러야 저장한다', async () => {
    mockApi()
    post.mockResolvedValue({
      data: { data: { id: 'created', name: '우리 소식', slug: 'board-1', status: 'ACTIVE' } },
    })
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: '사진 모음 예시로 시작' }))
    const name = await screen.findByLabelText(/게시판 이름/)
    expect(name).toHaveValue('사진 모음')
    await userEvent.clear(name)
    await userEvent.type(name, '우리 소식')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await userEvent.click(screen.getByRole('radio', { name: /목록형/ }))
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await screen.findByRole('heading', { name: '게시판을 만들었습니다' })
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/v1/boards',
      expect.objectContaining({ name: '우리 소식', board_type: 'LIST', slug: undefined })
    )
  })
})
