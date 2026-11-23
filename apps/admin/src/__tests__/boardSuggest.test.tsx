import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { AI_BOARD_ASSIST, type BoardSuggestion } from '@/lib/aiAssist'
import { toFieldInput, withoutTaken } from '@/lib/boardSuggestion'
import { BoardNewPage } from '@/pages/BoardNewPage'
import { BoardStructurePage } from '@/pages/BoardStructurePage'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'

// AI 게시판 구성 추천 화면 (관리자 화면 개선 · AI 보조 기획서 A-2, T-232-A) — 서버는 T-232-B

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const SUGGESTION: BoardSuggestion = {
  board_type: 'REVIEW',
  name: '치료 후기',
  description: '진료를 받은 분들의 후기를 모읍니다.',
  fields: [
    // 리뷰형이 늘 만드는 별점과 이름이 같다 — 건너뛴다
    { label: '별점', field_type: 'RATING', choices: [] },
    { label: '받은 진료', field_type: 'SELECT', choices: ['임플란트', '교정'] },
    { label: '방문 시기', field_type: 'DATE', choices: [] },
  ],
  categories: ['임플란트', '교정'],
  permissions: { read: 'PUBLIC', write: 'MEMBER' },
  operation: { allow_secret: false, notify_new_post: true, allow_guest: false },
  reason: '후기는 회원만 쓰게 해 광고 글을 줄여요.',
}

const board: Partial<Board> = {
  id: 'b1',
  name: '치료 후기',
  description: '치료 받은 분들의 후기',
  slug: 'reviews',
  system_key: null,
  board_type: 'REVIEW',
  status: 'ACTIVE',
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = ({ blocked = {} }: { blocked?: Record<string, string> } = {}) => {
  get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) => {
    if (url === '/v1/boards') return ok([board])
    if (url === '/v1/boards/limits')
      return ok({ plan: 'STANDARD', limit: 5, used: 1, can_create: true, reason: null })
    if (url === '/v1/boards/presets')
      return ok({
        LIST: [],
        REVIEW: [{ key: 'rating', label: '별점', field_type: 'RATING', choices: [], always: true }],
      })
    if (url === '/v1/boards/type-options') return ok({ blocked })
    if (url === '/v1/boards/permission-options')
      return ok({ member_read_blocked: null, member_write_blocked: null })
    if (url === '/v1/boards/b1/fields')
      return ok(
        config?.params?.trash
          ? []
          : [
              {
                id: 'f1',
                board_id: 'b1',
                field_key: 'treatment',
                label: '받은 진료',
                field_type: 'TEXT',
                is_required: false,
                is_visible: true,
                help_text: '',
                placeholder: '',
                default_value: null,
                options: [],
                min: null,
                max: null,
                show_in_list: false,
                display_order: 0,
                value_count: 0,
              },
            ]
      )
    if (url === '/v1/boards/b1/categories')
      return ok([{ id: 'c1', name: '교정', is_active: true, display_order: 0, post_count: 0 }])
    return ok(undefined)
  })
  post.mockImplementation((url: string, body: unknown) => {
    if (url === '/v1/ai/assist/board')
      return ok({ result: SUGGESTION, usage: { used: 4, limit: 20, remaining: 16 } })
    if (url === '/v1/boards') return ok({ ...board, ...(body as object), id: 'b1' })
    return ok({ id: 'new' })
  })
}

const renderAt = (path: string) =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/admin/boards/new', element: <BoardNewPage /> },
          { path: '/admin/boards/:boardId/structure', element: <BoardStructurePage /> },
        ],
        { initialEntries: [path] }
      )}
    />
  )

const flagOn = (on: boolean) =>
  useFeatureStore.setState({ loaded: true, flags: on ? { [AI_BOARD_ASSIST]: true } : {} })

const reviewSection = () =>
  screen.getByRole('heading', { name: '마지막으로 설정을 확인하세요' }).closest('section')!

const askFor = async (user: ReturnType<typeof userEvent.setup>, buttonName: string) => {
  await user.click(await screen.findByRole('button', { name: buttonName }))
  const drawer = screen.getByRole('dialog')
  await user.type(within(drawer).getByLabelText('어떤 게시판인가요?'), '치료 후기를 받는 게시판')
  await user.click(within(drawer).getByRole('button', { name: '추천받기' }))
  await within(drawer).findByLabelText('AI 추천')
  return drawer
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never, tenantSlug: 'clinic' })
  flagOn(true)
  mockApi()
})

afterEach(() => useFeatureStore.getState().reset())

describe('게시판 구성 추천 — 값 다루기 (T-232-A)', () => {
  it('이미 있는 이름 · 추천 안에서 겹친 이름은 건너뛴다 (띄어쓰기 · 대소문자 무시)', () => {
    expect(withoutTaken(['진료 과목', 'FAQ', '진료과목', '새 칸'], (n) => n, ['faq'])).toEqual([
      '진료 과목',
      '새 칸',
    ])
  })

  it('고르기 칸은 선택지 값을 opt_N 으로 만든다', () => {
    expect(
      toFieldInput({ label: '진료', field_type: 'SELECT', choices: ['교정', '충치'] })
    ).toEqual({
      label: '진료',
      field_type: 'SELECT',
      options: [
        { value: 'opt_1', label: '교정' },
        { value: 'opt_2', label: '충치' },
      ],
    })
    expect(toFieldInput({ label: '날짜', field_type: 'DATE', choices: [] })).toEqual({
      label: '날짜',
      field_type: 'DATE',
    })
  })
})

describe('게시판 만들기 [✨ AI 로 구성 추천받기] (T-232-A)', () => {
  it('기능 스위치가 꺼져 있으면(지금 모든 사업체) 버튼이 없다', async () => {
    flagOn(false)
    renderAt('/admin/boards/new')
    await screen.findByRole('heading', { name: '기본 정보를 입력해 주세요' })
    expect(screen.queryByRole('button', { name: 'AI 로 구성 추천받기' })).not.toBeInTheDocument()
  })

  it('적용하면 2 ~ 4단계를 채워 검토로 가고, 만들 때 추천 필드 · 카테고리를 차례로 만든다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/boards/new')
    const drawer = await askFor(user, 'AI 로 구성 추천받기')
    expect(post).toHaveBeenCalledWith('/v1/ai/assist/board', { purpose: '치료 후기를 받는 게시판' })
    expect(within(drawer).getByText('회원도 글쓰기', { exact: false })).toBeInTheDocument()
    expect(within(drawer).getByText(SUGGESTION.reason)).toBeInTheDocument()
    // 방문 시기는 빼고 적용
    await user.click(within(drawer).getByRole('checkbox', { name: /방문 시기/ }))
    await user.click(within(drawer).getByRole('button', { name: '적용하고 검토하기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '마지막으로 설정을 확인하세요' })
    ).toBeInTheDocument()
    const review = within(reviewSection())
    expect(review.getByText('치료 후기')).toBeInTheDocument()
    expect(review.getByText('리뷰형')).toBeInTheDocument()
    // 별점은 리뷰형이 늘 만드는 칸과 이름이 같아 건너뛴다
    expect(review.getByText(/AI 추천 1개/)).toBeInTheDocument()
    expect(review.getByText('임플란트 · 교정')).toBeInTheDocument()
    // AI 결과는 저장하지 않는다 — 만들기는 관리자가
    expect(post).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '게시판 만들기' }))
    await screen.findByRole('heading', { name: '게시판을 만들었습니다' })
    expect(post).toHaveBeenCalledWith(
      '/v1/boards',
      expect.objectContaining({
        name: '치료 후기',
        board_type: 'REVIEW',
        permissions: { read: 'PUBLIC', write: 'MEMBER' },
        operation: { allow_guest: false, allow_secret: false, notify_new_post: true },
        preset_fields: ['rating'],
      })
    )
    const calls = post.mock.calls.slice(2).map(([url, body]) => [url, body])
    expect(calls).toEqual([
      [
        '/v1/boards/b1/fields',
        {
          label: '받은 진료',
          field_type: 'SELECT',
          options: [
            { value: 'opt_1', label: '임플란트' },
            { value: 'opt_2', label: '교정' },
          ],
        },
      ],
      ['/v1/boards/b1/categories', { name: '임플란트' }],
      ['/v1/boards/b1/categories', { name: '교정' }],
    ])
    expect(screen.getByText(/AI 추천 필드 1개 · 카테고리 2개를/)).toBeInTheDocument()
  })

  it('고를 수 없는 유형을 추천받으면 유형은 그대로 두고 알린다', async () => {
    mockApi({ blocked: { REVIEW: '병원 업종은 리뷰형을 쓸 수 없습니다.' } })
    const user = userEvent.setup()
    renderAt('/admin/boards/new')
    const drawer = await askFor(user, 'AI 로 구성 추천받기')
    expect(
      within(drawer).getByText(/병원 업종은 리뷰형을 쓸 수 없습니다\. 유형은 그대로 둬요\./)
    ).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '적용하고 검토하기' }))
    expect(within(reviewSection()).getByText('목록형')).toBeInTheDocument()
  })

  it('필드 추가가 일부 실패해도 게시판은 만들어지고 실패 수를 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/boards/new')
    const drawer = await askFor(user, 'AI 로 구성 추천받기')
    await user.click(within(drawer).getByRole('button', { name: '적용하고 검토하기' }))
    const base = post.getMockImplementation()!
    post.mockImplementation((url: string, body: unknown) =>
      url.endsWith('/categories') ? Promise.reject(new Error('limit')) : base(url, body)
    )
    await user.click(screen.getByRole('button', { name: '게시판 만들기' }))
    await screen.findByRole('heading', { name: '게시판을 만들었습니다' })
    expect(screen.getByRole('alert')).toHaveTextContent('2개를 만들지 못했습니다')
  })
})

describe('필드 · 카테고리 [✨ 필드 · 카테고리 추천] (T-232-A)', () => {
  it('게시판 설명으로 시작하고, 같은 이름은 고를 수 없으며 고른 것만 추가한다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/boards/b1/structure')
    await user.click(await screen.findByRole('button', { name: '필드 · 카테고리 추천' }))
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByLabelText('어떤 게시판인가요?')).toHaveValue('치료 받은 분들의 후기')
    // 유형 · 이름 · 권한은 만들기에서만
    await user.click(within(drawer).getByRole('button', { name: '추천받기' }))
    await within(drawer).findByLabelText('AI 추천')
    expect(post).toHaveBeenCalledWith('/v1/ai/assist/board', {
      purpose: '치료 받은 분들의 후기',
      board_id: 'b1',
    })
    expect(within(drawer).queryByText('권한 · 운영')).not.toBeInTheDocument()

    const taken = within(drawer).getByRole('checkbox', { name: /받은 진료/ })
    expect(taken).toBeDisabled()
    expect(taken).not.toBeChecked()
    expect(within(drawer).getByRole('checkbox', { name: /^교정/ })).toBeDisabled()
    await user.click(within(drawer).getByRole('checkbox', { name: /별점/ }))
    await user.click(within(drawer).getByRole('button', { name: '고른 것 추가' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post.mock.calls.slice(1).map(([url, body]) => [url, body])).toEqual([
      ['/v1/boards/b1/fields', { label: '방문 시기', field_type: 'DATE' }],
      ['/v1/boards/b1/categories', { name: '임플란트' }],
    ])
    expect(toast.success).toHaveBeenCalledWith('필드 1개 · 카테고리 1개를 추가했어요.')
  })

  it('보기 전용 계정에는 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } as never })
    renderAt('/admin/boards/b1/structure')
    await screen.findByRole('heading', { name: '필드' })
    expect(screen.queryByRole('button', { name: '필드 · 카테고리 추천' })).not.toBeInTheDocument()
  })
})
