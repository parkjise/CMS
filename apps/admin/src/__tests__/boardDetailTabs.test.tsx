import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardSectionRedirect } from '@/components/boards/BoardSectionNav'
import { BoardSetupPage } from '@/pages/BoardSetupPage'
import { BoardStructurePage } from '@/pages/BoardStructurePage'
import { useAuthStore } from '@/stores/authStore'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn() } }))

const board = {
  id: 'b1',
  name: '자유게시판',
  slug: 'free',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  post_count: 0,
  has_samples: false,
  deleted_at: null,
  sort_order: 'LATEST',
  page_size: null,
  seo_title: '',
  seo_description: '',
  seo_index: true,
  design: {},
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
} as unknown as Board
const notice = {
  ...board,
  id: 'n1',
  name: '공지사항',
  slug: 'notice',
  system_key: 'notice',
} as Board

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const render = (path: string, boards: Board[] = [board]) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok(boards)
    if (url.endsWith('/permission-options'))
      return ok({ member_read_blocked: null, member_write_blocked: null })
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code', reorderable: true, items: [] })
    return ok([])
  })
  const router = createMemoryRouter(
    [
      { path: '/admin/boards/:boardId/settings', element: <BoardSetupPage /> },
      { path: '/admin/boards/:boardId/fields', element: <BoardStructurePage /> },
      ...(
        [
          ['connection', 'settings'],
          ['permissions', 'settings'],
          ['operation', 'settings'],
          ['categories', 'fields'],
        ] as const
      ).map(([section, page]) => ({
        path: `/admin/boards/:boardId/${section}`,
        element: <BoardSectionRedirect page={page} section={section} />,
      })),
    ],
    { initialEntries: [path] }
  )
  renderWithQuery(<RouterProvider router={router} />)
  return router
}

// 합친 화면의 구역 (section aria-labelledby → region) 이름
const headings = () =>
  screen
    .getAllByRole('region')
    .map((r) => r.getAttribute('aria-labelledby'))
    .filter(Boolean)
    .map((id) => document.getElementById(id!)?.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('게시판 상세 탭 4개 (T-212)', () => {
  it('설정은 기본 정보 · 권한 · 운영 설정 · 홈페이지 연결 구역을 한 화면에', async () => {
    render('/admin/boards/b1/settings')
    // 운영 설정 새 글 알림 설명에도 '게시판 이름' 이 들어 있다
    await screen.findAllByLabelText(/게시판 이름/)
    await waitFor(() =>
      expect(headings()).toEqual(['기본 정보', '권한', '운영 설정', '홈페이지 연결'])
    )
    const nav = screen.getByRole('navigation', { name: '구역 바로가기' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['#basic', '#permissions', '#operation', '#connection'])
    expect(screen.getByRole('heading', { level: 1, name: '게시판 설정' })).toBeInTheDocument()
  })

  it('기본 게시판 설정은 기본 정보 · 홈페이지 연결만', async () => {
    render('/admin/boards/n1/settings', [notice])
    await screen.findByLabelText(/게시판 이름/)
    expect(headings()).toEqual(['기본 정보', '홈페이지 연결'])
  })

  it('필드 · 카테고리는 두 구역, 기본 게시판은 안내만', async () => {
    render('/admin/boards/b1/fields')
    await waitFor(() => expect(headings()).toEqual(expect.arrayContaining(['필드', '카테고리'])))
    expect(screen.getByRole('heading', { level: 1, name: '필드 · 카테고리' })).toBeInTheDocument()
  })

  it('기본 게시판의 필드 · 카테고리 주소는 안내를 보여 준다', async () => {
    render('/admin/boards/n1/fields', [notice])
    expect(
      await screen.findByText('기본 게시판에는 칸과 카테고리를 만들 수 없습니다.')
    ).toBeInTheDocument()
  })

  it.each([
    ['permissions', '/admin/boards/b1/settings', '#permissions'],
    ['operation', '/admin/boards/b1/settings', '#operation'],
    ['connection', '/admin/boards/b1/settings', '#connection'],
    ['categories', '/admin/boards/b1/fields', '#categories'],
  ])('예전 주소 /%s 는 합친 화면의 그 구역으로', async (section, pathname, hash) => {
    const router = render(`/admin/boards/b1/${section}`)
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname))
    expect(router.state.location.hash).toBe(hash)
  })
})
