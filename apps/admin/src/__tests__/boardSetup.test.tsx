import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import {
  changedSections,
  sectionOfField,
  setupImpacts,
  setupPayload,
  toSetupDraft,
} from '@/lib/boardSetup'
import { BoardSetupPage } from '@/pages/BoardSetupPage'
import { useAuthStore } from '@/stores/authStore'

const { get, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, patch, post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board = {
  updated_at: '2026-11-05T00:00:00Z',
  id: 'b1',
  name: '자주 묻는 질문',
  slug: 'faq',
  description: '',
  board_type: 'FAQ',
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
  menu_parent: '',
} as unknown as Board

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const render = ({ faqLinked = false }: { faqLinked?: boolean } = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([board])
    if (url.endsWith('/permission-options'))
      return ok({ member_read_blocked: null, member_write_blocked: null })
    if (url === '/v1/seo-settings/aeo')
      return ok({ faq_board_ids: faqLinked ? ['b1'] : [], boards: [] })
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code', items: [], nodes: [] })
    return ok([])
  })
  const router = createMemoryRouter(
    [
      { path: '/admin/boards/:boardId/settings', element: <BoardSetupPage /> },
      { path: '*', element: <p>이동한 화면</p> },
    ],
    { initialEntries: ['/admin/boards/b1/settings'] }
  )
  renderWithQuery(<RouterProvider router={router} />)
  return router
}

const region = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('게시판 설정 값 다루기 (T-228)', () => {
  const saved = toSetupDraft(board)

  it('바뀐 구역의 값만 보내고, 연결은 바뀐 칸만', () => {
    const draft = {
      ...saved,
      permissions: { read: 'MEMBER' as const, write: 'ADMIN' as const },
      connection: { ...saved.connection, status: 'INACTIVE' as const },
    }
    expect(changedSections(draft, saved)).toEqual(['permissions', 'connection'])
    expect(setupPayload(draft, saved, false)).toEqual({
      permissions: { read: 'MEMBER', write: 'ADMIN' },
      status: 'INACTIVE',
    })
  })

  it('기본 게시판은 검색 칸을 보내지 않고, 이름은 앞뒤 공백을 지운다', () => {
    const draft = { ...saved, basic: { ...saved.basic, name: ' 공지 ', seo_title: '무시' } }
    expect(setupPayload(draft, saved, true)).toEqual({ name: '공지', description: '' })
  })

  it('저장하지 않은 신고 기준(5)은 바뀐 것으로 보지 않는다', () => {
    expect(changedSections(toSetupDraft(board), saved)).toEqual([])
    expect(saved.operation.report_hide_count).toBe(5)
  })

  it('서버 오류의 칸을 구역으로', () => {
    expect(sectionOfField('slug')).toBe('connection')
    expect(sectionOfField('permissions.write')).toBe('permissions')
    expect(sectionOfField('operation.allow_guest')).toBe('operation')
    expect(sectionOfField('seo_title')).toBe('basic')
    expect(sectionOfField('board_type')).toBeNull()
    expect(sectionOfField(undefined)).toBeNull()
  })

  it('저장하면 달라지는 것', () => {
    const memberOnly = { ...saved, permissions: { ...saved.permissions, read: 'MEMBER' as const } }
    expect(setupImpacts(memberOnly, saved, { faqStructured: true })).toEqual([
      '회원만 읽게 하면 검색엔진 사이트맵에서 빠집니다.',
      'AEO 설정의 FAQ 구조화 데이터에서도 빠집니다.',
    ])
    const off = {
      ...saved,
      basic: { ...saved.basic, seo_index: false },
      connection: { ...saved.connection, status: 'INACTIVE' as const, slug: 'faq-2' },
    }
    expect(setupImpacts(off, saved, { faqStructured: false })).toEqual([
      '게시판을 끄면 홈페이지 메뉴 · 사이트맵에서 빠지고 글이 보이지 않습니다.',
      '주소를 바꾸면 예전 주소로 들어온 방문자는 게시판을 찾지 못합니다.',
    ])
    expect(setupImpacts(saved, saved, { faqStructured: true })).toEqual([])
  })
})

describe('게시판 설정 한 번에 저장 (T-228)', () => {
  it('여러 구역을 고치면 수정됨을 표시하고 요청 한 번으로 저장한다', async () => {
    patch.mockImplementation((_url: string, payload: Record<string, unknown>) =>
      ok({ ...board, ...payload, permissions: { read: 'MEMBER', write: 'ADMIN' } })
    )
    render({ faqLinked: true })
    const save = await screen.findByRole('button', { name: '변경사항 저장' })
    expect(save).toBeDisabled()
    // 구역마다 따로 있던 [저장]은 없다
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()

    const name = within(region('기본 정보')).getByLabelText(/^게시판 이름/)
    await userEvent.type(name, '!')
    await userEvent.click(within(region('권한')).getByRole('radio', { name: /회원만/ }))
    await userEvent.click(within(region('운영 설정')).getByText('새 글 알림'))

    for (const title of ['기본 정보', '권한', '운영 설정']) {
      expect(within(region(title)).getByText('수정됨')).toBeInTheDocument()
    }
    expect(within(region('홈페이지 연결')).queryByText('수정됨')).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: '구역 바로가기' })
    expect(within(nav).getByRole('link', { name: /^권한\s*\(수정됨\)/ })).toBeInTheDocument()

    const impacts = screen.getByRole('list', { name: '저장하면 달라지는 것' })
    expect(impacts).toHaveTextContent('회원만 읽게 하면 검색엔진 사이트맵에서 빠집니다.')
    expect(impacts).toHaveTextContent('AEO 설정의 FAQ 구조화 데이터에서도 빠집니다.')

    await userEvent.click(save)
    await waitFor(() => expect(patch).toHaveBeenCalledOnce())
    expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
      name: '자주 묻는 질문!',
      description: '',
      seo_title: '',
      seo_description: '',
      seo_index: true,
      permissions: { read: 'MEMBER', write: 'ADMIN' },
      operation: {
        allow_secret: false,
        notify_new_post: true,
        allow_guest: false,
        report_hide_count: 5,
      },
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('[변경 취소] 는 모든 구역을 되돌린다', async () => {
    render()
    await userEvent.click(await screen.findByRole('radio', { name: /회원만/ }))
    await userEvent.type(screen.getByLabelText('주소 이름'), '-2')
    await userEvent.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(screen.getByRole('radio', { name: /누구나/ })).toBeChecked()
    expect(screen.getByLabelText('주소 이름')).toHaveValue('faq')
    expect(screen.queryByText('수정됨')).not.toBeInTheDocument()
  })

  it('잘못된 주소는 보내지 않고 그 칸에 알린다, 서버가 거절한 칸도', async () => {
    patch.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'CONFLICT', field: 'slug', message: '이미 쓰는 주소입니다.' } },
      },
    })
    render()
    const slug = await screen.findByLabelText('주소 이름')
    await userEvent.type(slug, '한글')
    await userEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    expect(await screen.findByText(/영문 소문자/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()

    await userEvent.clear(slug)
    await userEvent.type(slug, 'notice-board')
    await userEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    expect(await screen.findByText('이미 쓰는 주소입니다.')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalled()
    expect(slug).toHaveValue('notice-board')
  })

  it('고친 채 다른 화면으로 가면 나가기 확인 (T-227)', async () => {
    const router = render()
    await userEvent.click(await screen.findByRole('radio', { name: /회원만/ }))
    await act(() => router.navigate('/admin/boards'))
    expect(await screen.findByRole('dialog')).toHaveTextContent('저장하지 않은 변경사항')
    await userEvent.click(screen.getByRole('button', { name: '계속 편집' }))
    expect(router.state.location.pathname).toBe('/admin/boards/b1/settings')
  })

  it('보기 전용 계정은 저장 막대가 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    render()
    expect(await screen.findByLabelText(/^게시판 이름/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
  })
})
