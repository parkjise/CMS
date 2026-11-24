import { createRef } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import type { Board, Post, RichNode } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { type RichTextEditorHandle, RichTextEditor } from '@/components/boards/RichTextEditor'
import { AeoPage } from '@/pages/AeoPage'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { AI_BOARD_ASSIST, type PostDraftSuggestion } from '@/lib/aiAssist'
import { draftToNodes } from '@/lib/aiPostDraft'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, post } }))
vi.mock('@/hooks/useUploadImage', () => ({ uploadImage: vi.fn() }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

beforeAll(() => {
  // jsdom 에 없는 배치 API — ProseMirror 가 부른다
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  }
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as never
  Range.prototype.getBoundingClientRect = () => rect
  HTMLElement.prototype.scrollIntoView = vi.fn()
  document.elementFromPoint = () => null
})

const text = (value: string): RichNode => ({ type: 'text', text: value })
const para = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content })

/** 편집기가 붙이는 빈 속성(textAlign 등)은 빼고 모양만 */
const shape = (nodes: RichNode[] = []): RichNode[] =>
  nodes.map(({ type, text: value, marks, content }) => ({
    type,
    ...(value !== undefined ? { text: value } : {}),
    ...(marks ? { marks } : {}),
    ...(content ? { content: shape(content) } : {}),
  }))
const lastBody = (onChange: ReturnType<typeof vi.fn>) => shape(onChange.mock.lastCall?.[0])

const NOTICE: PostDraftSuggestion = {
  titles: ['추석 연휴 휴진 안내', '추석 연휴 진료 일정', '[공지] 추석 휴진'],
  body: [
    { type: 'p', text: '연휴 동안 휴진합니다.' },
    { type: 'ul', items: ['휴진: 9월 14일 ~ 18일'] },
  ],
}

const FAQ: PostDraftSuggestion = {
  titles: ['주차할 수 있나요?'],
  body: [{ type: 'p', text: '네, 지하 주차장을 쓰실 수 있어요.' }],
}

const board = (type: Board['board_type']) =>
  ({
    id: 'b1',
    name: type === 'FAQ' ? '자주 묻는 질문' : '소식',
    slug: 'news',
    board_type: type,
    status: 'ACTIVE',
    system_key: null,
    operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
  }) as Board

const existing: Post = {
  id: 'p1',
  board_id: 'b1',
  title: '원래 제목',
  status: 'DRAFT',
  is_pinned: false,
  is_secret: false,
  published_at: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-10T00:00:00Z',
  deleted_at: null,
  custom_data: {},
  body: [para(text('원래 본문'))],
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = (type: Board['board_type'], draft: PostDraftSuggestion) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([board(type)])
    if (url.endsWith('/posts/p1')) return ok(existing)
    if (url === '/v1/seo-settings/aeo') {
      return ok({
        faq_board_ids: [],
        boards: [
          { id: 'b1', name: 'FAQ', slug: 'faq', active: true, member_only: false, items: [] },
        ],
      })
    }
    if (url.endsWith('/categories') || url.endsWith('/fields')) return ok([])
    return ok(null)
  })
  post.mockImplementation((url: string, body: unknown) => {
    if (url === '/v1/ai/assist/post') {
      return ok({ result: draft, usage: { used: 4, limit: 20, remaining: 16 } })
    }
    return ok({ id: 'p9', ...(body as object) })
  })
}

const renderAt = (path: string) =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/admin/boards/:boardId/posts/new', element: <BoardPostEditPage /> },
          { path: '/admin/boards/:boardId/posts/:postId/edit', element: <BoardPostEditPage /> },
          { path: '/admin/site/aeo', element: <AeoPage /> },
          { path: '*', element: <p>이동한 화면</p> },
        ],
        { initialEntries: [path] }
      )}
    />
  )

const flagOn = (on: boolean) =>
  useFeatureStore.setState({ loaded: true, flags: on ? { [AI_BOARD_ASSIST]: true } : {} })

const editorBox = () => screen.getByRole('textbox', { name: '내용' })
const titleBox = () => screen.getByRole('textbox', { name: /^제목/ })

const askDraft = async (
  user: ReturnType<typeof userEvent.setup>,
  memoLabel = '어떤 글을 쓸까요?'
) => {
  await user.click(await screen.findByRole('button', { name: 'AI 초안' }))
  const drawer = screen.getByRole('dialog')
  await user.type(within(drawer).getByLabelText(memoLabel), '추석 연휴 휴진')
  await user.click(within(drawer).getByRole('button', { name: '초안 만들기' }))
  await within(drawer).findByLabelText('AI 초안')
  return drawer
}

const savedBody = () => {
  const call = post.mock.calls.find(([url]) => url === '/v1/boards/b1/posts')
  return (call?.[1] as { title: string; body: RichNode[] }) ?? null
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.sessionStorage.clear()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never, tenantSlug: 'clinic' })
  flagOn(true)
  mockApi('LIST', NOTICE)
})

afterEach(() => useFeatureStore.getState().reset())

describe('AI 초안 → 편집기 노드 (T-233-A)', () => {
  it('문단 · 줄바꿈 · 글머리 목록으로 바꾸고 빈 칸은 뺀다', () => {
    expect(
      draftToNodes([
        { type: 'p', text: '첫 줄\n둘째 줄' },
        { type: 'p', text: '  ' },
        { type: 'ul', items: ['하나', ''] },
        { type: 'ul', items: [' '] },
      ])
    ).toEqual([
      para(text('첫 줄'), { type: 'hardBreak' }, text('둘째 줄')),
      { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('하나'))] }] },
    ])
  })

  it('HTML · 굵게 표시는 서식이 아닌 글자 그대로 넣는다', async () => {
    const onChange = vi.fn()
    const ref = createRef<RichTextEditorHandle>()
    render(<RichTextEditor ref={ref} initial={[]} editable onChange={onChange} />)
    act(() =>
      ref.current!.insertNodes(
        draftToNodes([{ type: 'p', text: '<b>굵게</b> **별표** <script>x</script>' }]),
        'replace'
      )
    )
    expect(lastBody(onChange)).toEqual([para(text('<b>굵게</b> **별표** <script>x</script>'))])
    expect(
      document.querySelector('.ProseMirror b, .ProseMirror strong, .ProseMirror script')
    ).toBeNull()
  })

  it('붙이기는 지금 본문 뒤에, 바꾸기는 본문을 바꾼다', async () => {
    const onChange = vi.fn()
    const ref = createRef<RichTextEditorHandle>()
    render(<RichTextEditor ref={ref} initial={[para(text('원래'))]} editable onChange={onChange} />)
    act(() => ref.current!.insertNodes([para(text('초안'))], 'append'))
    expect(lastBody(onChange)).toEqual([para(text('원래')), para(text('초안'))])
    act(() => ref.current!.insertNodes([para(text('새 글'))], 'replace'))
    expect(lastBody(onChange)).toEqual([para(text('새 글'))])
  })
})

describe('글쓰기 [✨ AI 초안] (T-233-A)', () => {
  it('기능 스위치가 꺼져 있으면(지금 모든 사업체) 버튼이 없다', async () => {
    flagOn(false)
    renderAt('/admin/boards/b1/posts/new')
    await screen.findByRole('toolbar', { name: '글 서식' })
    expect(screen.queryByRole('button', { name: 'AI 초안' })).not.toBeInTheDocument()
  })

  it('빈 글은 첫 제목 후보와 본문을 넣고, 저장은 관리자가 누를 때만', async () => {
    const user = userEvent.setup()
    renderAt('/admin/boards/b1/posts/new')
    const drawer = await askDraft(user)
    expect(post).toHaveBeenCalledWith('/v1/ai/assist/post', {
      memo: '추석 연휴 휴진',
      board_id: 'b1',
    })
    expect(within(drawer).getByRole('radio', { name: '추석 연휴 휴진 안내' })).toBeChecked()
    // 본문이 비어 있으면 붙일지 묻지 않는다
    expect(within(drawer).queryByText(/뒤에 붙일까요/)).not.toBeInTheDocument()
    expect(within(drawer).getByText(/숫자 · 날짜가 메모와 같은지/)).toBeInTheDocument()

    await user.click(within(drawer).getByRole('radio', { name: '추석 연휴 진료 일정' }))
    await user.click(within(drawer).getByRole('button', { name: '편집 칸에 넣기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(titleBox()).toHaveValue('추석 연휴 진료 일정')
    await waitFor(() => expect(editorBox()).toHaveTextContent('연휴 동안 휴진합니다.'))
    expect(post).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(savedBody()).not.toBeNull())
    expect(savedBody()).toMatchObject({
      title: '추석 연휴 진료 일정',
      body: [
        para(text('연휴 동안 휴진합니다.')),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [para(text('휴진: 9월 14일 ~ 18일'))] }],
        },
      ],
    })
  })

  it('쓰던 글은 제목을 그대로 두고, 본문은 붙일지 바꿀지 고른다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/boards/b1/posts/p1/edit')
    await waitFor(() => expect(editorBox()).toHaveTextContent('원래 본문'))
    const drawer = await askDraft(user)
    expect(within(drawer).getByRole('radio', { name: /지금 제목 그대로/ })).toBeChecked()
    expect(within(drawer).getByRole('radio', { name: '뒤에 붙이기' })).toBeChecked()

    await user.click(within(drawer).getByRole('radio', { name: '본문 바꾸기' }))
    await user.click(within(drawer).getByRole('button', { name: '편집 칸에 넣기' }))
    expect(titleBox()).toHaveValue('원래 제목')
    await waitFor(() => expect(editorBox()).toHaveTextContent('연휴 동안 휴진합니다.'))
    expect(editorBox()).not.toHaveTextContent('원래 본문')
  })

  it('제목도 본문도 그대로 두면 넣을 것이 없다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/boards/b1/posts/p1/edit')
    await waitFor(() => expect(editorBox()).toHaveTextContent('원래 본문'))
    const drawer = await askDraft(user)
    await user.click(within(drawer).getByRole('radio', { name: '그대로 두기' }))
    expect(within(drawer).getByRole('button', { name: '편집 칸에 넣기' })).toBeDisabled()
  })
})

describe('FAQ 질문 초안 (T-233-A)', () => {
  it('AEO [✨ 질문 초안] 은 FAQ 글쓰기로 가며 서랍을 열고, 질문 · 답변 한 쌍을 넣는다', async () => {
    mockApi('FAQ', FAQ)
    const user = userEvent.setup()
    renderAt('/admin/site/aeo')
    await user.click(await screen.findByRole('link', { name: '질문 초안' }))

    const drawer = await screen.findByRole('dialog', { name: 'AI 로 질문 · 답변 초안 만들기' })
    await user.type(within(drawer).getByLabelText('어떤 질문에 답할까요?'), '주차 되나요')
    await user.click(within(drawer).getByRole('button', { name: '초안 만들기' }))
    await within(drawer).findByLabelText('AI 초안')
    expect(within(drawer).getByRole('group', { name: '질문' })).toBeInTheDocument()
    expect(within(drawer).getByRole('heading', { name: '답변' })).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: '편집 칸에 넣기' }))
    expect(titleBox()).toHaveValue('주차할 수 있나요?')
    await waitFor(() => expect(editorBox()).toHaveTextContent('네, 지하 주차장을 쓰실 수 있어요.'))
  })

  it('기능 스위치가 꺼져 있으면 AEO 에도 [질문 초안] 이 없다', async () => {
    flagOn(false)
    renderAt('/admin/site/aeo')
    await screen.findByRole('link', { name: '질문 추가' })
    expect(screen.queryByRole('link', { name: '질문 초안' })).not.toBeInTheDocument()
  })
})
