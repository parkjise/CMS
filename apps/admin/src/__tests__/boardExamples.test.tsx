import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
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
const CONTENT_PRESETS = [
  {
    key: 'history',
    name: '연혁',
    description: '걸어온 길을 연도별로 정리합니다.',
    board_type: 'LIST',
    fields: [
      { key: 'year', label: '연도', field_type: 'TEXT', choices: [], show_in_list: true, always: false },
    ],
  },
  {
    key: 'reviews',
    name: '후기',
    description: '고객 후기를 모아 보여 줍니다.',
    board_type: 'REVIEW',
    fields: [],
  },
]
const mockApi = ({ boards = [notice], canCreate = true, content = false, blocked = {} } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url === '/v1/boards/content-presets') return ok(content ? CONTENT_PRESETS : [])
    if (url === '/v1/boards/type-options') return ok({ blocked })
    if (url === '/v1/boards/limits')
      return ok({ can_create: canCreate, reason: canCreate ? null : '게시판 한도입니다.' })
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code', items: [] })
    return ok(undefined)
  })
}
// 게시판 만들기의 나가기 확인(useBlocker)은 데이터 라우터가 필요하다 (T-210)
const renderPage = (path = '/admin/boards') =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/admin/boards', element: <BoardsPage /> },
          { path: '/admin/boards/new', element: <BoardNewPage /> },
        ],
        { initialEntries: [path] }
      )}
    />
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

  it('넓은 화면에서는 예시를 4열로 보여 준다 (T-210)', async () => {
    mockApi({ boards: [notice] })
    renderPage()
    const section = await screen.findByRole('region', { name: '이런 게시판으로 시작해 보세요' })
    expect(within(section).getByRole('list')).toHaveClass('lg:grid-cols-4')
  })

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
      await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
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
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    await userEvent.click(screen.getByRole('radio', { name: /목록형/ }))
    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    }
    expect(post).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '게시판 만들기' }))
    await screen.findByRole('heading', { name: '게시판을 만들었습니다' })
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/v1/boards',
      expect.objectContaining({ name: '우리 소식', board_type: 'LIST', slug: undefined })
    )
  })
})

describe('콘텐츠형 게시판 프리셋 (T-243)', () => {
  it('목록에서 콘텐츠형 프리셋을 보여 주고, 막힌 유형은 이유만 보인다', async () => {
    mockApi({ content: true, blocked: { REVIEW: '병원 업종은 리뷰형을 쓸 수 없습니다.' } })
    renderPage()
    await screen.findByRole('heading', { name: '콘텐츠형 게시판' })
    expect(screen.getByRole('link', { name: '연혁 콘텐츠형으로 시작' })).toHaveAttribute(
      'href',
      '/admin/boards/new?content=history'
    )
    expect(screen.queryByRole('link', { name: '후기 콘텐츠형으로 시작' })).toBeNull()
    expect(screen.getByText('병원 업종은 리뷰형을 쓸 수 없습니다.')).toBeInTheDocument()
  })

  it('프리셋으로 시작하면 이름 · 유형 · 칸을 채우고 상단 메뉴 · 방문자 글쓰기 없이 만든다', async () => {
    mockApi({ content: true })
    post.mockResolvedValue({
      data: { data: { id: 'created', name: '연혁', slug: 'board-1', status: 'ACTIVE' } },
    })
    renderPage('/admin/boards/new?content=history')
    await waitFor(() => expect(screen.getByLabelText(/게시판 이름/)).toHaveValue('연혁'))
    expect(screen.getByText(/콘텐츠형 게시판으로 시작합니다/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '홈페이지 상단 메뉴에 추가' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    expect(screen.getByRole('radio', { name: /목록형/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    expect(screen.getByRole('checkbox', { name: /연도/ })).toBeChecked()
    for (let i = 0; i < 2; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: /다음 단계/ }))
    }
    await userEvent.click(screen.getByRole('button', { name: '게시판 만들기' }))
    await screen.findByRole('heading', { name: '게시판을 만들었습니다' })
    expect(post).toHaveBeenCalledWith(
      '/v1/boards',
      expect.objectContaining({
        name: '연혁',
        board_type: 'LIST',
        in_menu: false,
        preset_fields: ['year'],
        is_content: true,
        permissions: { read: 'PUBLIC', write: 'ADMIN' },
        operation: expect.objectContaining({ allow_guest: false }),
      })
    )
    expect(screen.getByRole('link', { name: '페이지에 연결하기' })).toHaveAttribute(
      'href',
      '/admin/pages'
    )
  })
})
