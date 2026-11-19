import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import type { MenuNode, SiteMenu } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { SiteMenuPage } from '@/pages/SiteMenuPage'
import {
  moveWithin,
  nodeWarning,
  parentChoices,
  removeNode,
  reparent,
  setVisibleByKey,
  treeError,
} from '@/lib/menuTree'
import { useAuthStore } from '@/stores/authStore'

// 사이트 관리 → 메뉴 관리 트리 (T-223, 사이트 관리 기획서 SM-02)
const { get, put, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, put, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const n = (id: string, label: string, extra: Partial<MenuNode> = {}): MenuNode => ({
  id,
  label,
  type: 'page',
  target: id,
  new_window: false,
  visible: true,
  children: [],
  ...extra,
})

const TREE: MenuNode[] = [
  n('about', '회사소개', { children: [n('about-history', '연혁')] }),
  n('business', '사업영역'),
  n('b-news', '소식', { type: 'board', target: 'news-id' }),
]

const menu = (over: Partial<SiteMenu> = {}): SiteMenu => ({
  mode: 'code',
  reorderable: true,
  saved: true,
  max_depth: 3,
  nodes: TREE,
  pages: [
    { key: 'about', label: '회사소개', parent: null },
    { key: 'about-history', label: '연혁', parent: 'about' },
    { key: 'business', label: '사업영역', parent: null },
  ],
  boards: [
    {
      id: 'news-id',
      name: '소식',
      slug: 'news',
      active: true,
      member_only: false,
      menu_parent: null,
    },
    {
      id: 'old-id',
      name: '옛 게시판',
      slug: 'old',
      active: false,
      member_only: false,
      menu_parent: null,
    },
  ],
  items: [],
  ...over,
})

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const renderPage = () =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter([{ path: '/admin/site/menu', element: <SiteMenuPage /> }], {
        initialEntries: ['/admin/site/menu'],
      })}
    />
  )

const tree = () => screen.getByRole('list', { name: '메뉴 구성' })
/** 트리에서 메뉴를 고르는 버튼 — 위 · 아래 버튼과 구분 */
const row = (label: string) =>
  within(tree()).getByRole('button', { name: new RegExp(`^${label}(?! (위로|아래로))`) })
const saveButton = () => screen.getByRole('button', { name: '변경사항 저장' })

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.c', name: '관리자', role: 'TENANT_ADMIN', tenant_id: 't1' },
  } as never)
})

describe('메뉴 트리 함수', () => {
  it('같은 단계 안에서만 위 · 아래로', () => {
    expect(moveWithin(TREE, 'business', -1).map((x) => x.id)).toEqual([
      'business',
      'about',
      'b-news',
    ])
    expect(moveWithin(TREE, 'about', -1)).toEqual(TREE)
  })

  it('상위 메뉴 — 자기 · 하위 메뉴는 고를 수 없고, 3단계를 넘지 않는다', () => {
    const deep = [
      n('a', 'A', { children: [n('b', 'B', { children: [n('c', 'C')] })] }),
      n('d', 'D'),
    ]
    // a 는 이미 3단계 — 다른 메뉴 아래로 갈 수 없다
    expect(parentChoices(deep, 'a', 3).map((f) => f.node.id)).toEqual([])
    // d 는 c 아래로 가면 4단계 — 고를 수 없다
    expect(parentChoices(deep, 'd', 3).map((f) => f.node.id)).toEqual(['a', 'b'])
    expect(reparent(deep, 'a', 'c', 3)).toEqual(deep)
    expect(reparent(deep, 'd', 'c', 3)).toEqual(deep)
    expect(reparent(deep, 'd', 'b', 3)[0].children[0].children.map((x) => x.id)).toEqual(['c', 'd'])
  })

  it('하위 메뉴가 있는 메뉴 지우기 — 위로 옮기기 / 함께 삭제', () => {
    expect(removeNode(TREE, 'about', true).map((x) => x.id)).toEqual([
      'about-history',
      'business',
      'b-news',
    ])
    expect(removeNode(TREE, 'about', false).map((x) => x.id)).toEqual(['business', 'b-news'])
  })

  it('연결 대상 경고', () => {
    const m = menu()
    expect(nodeWarning(n('gone', '없는 페이지'), m.pages, m.boards)).toMatch(/템플릿에 없어요/)
    expect(
      nodeWarning(n('x', 'x', { type: 'board', target: 'old-id' }), m.pages, m.boards)
    ).toMatch(/사용 안 함/)
    expect(
      nodeWarning(n('x', 'x', { type: 'board', target: 'deleted' }), m.pages, m.boards)
    ).toMatch(/지워졌어요/)
    expect(nodeWarning(n('x', 'x', { type: 'group', target: null }), m.pages, m.boards)).toMatch(
      /하위 메뉴가 없는/
    )
    expect(
      nodeWarning(n('x', 'x', { type: 'url', target: 'javascript:alert(1)' }), m.pages, m.boards)
    ).toMatch(/http/)
  })

  it('저장 전 오류 — 빈 이름 · 긴 이름 · 잘못된 주소', () => {
    expect(treeError([n('a', ' ')])).toMatch(/이름이 비어/)
    expect(treeError([n('a', '가'.repeat(21))])).toMatch(/20자/)
    expect(treeError([n('a', '블로그', { type: 'url', target: 'ftp://x' })])).toMatch(/http/)
    expect(treeError(TREE)).toBeNull()
  })

  it('게시판 화면의 메뉴 표시 — 트리 어디에 있든, 없으면 끝에 더한다', () => {
    const hidden = setVisibleByKey(TREE, 'about-history', false, '연혁')
    expect(hidden[0].children[0].visible).toBe(false)
    const added = setVisibleByKey(TREE, 'board:new-id', true, '새 게시판')
    expect(added).toHaveLength(4)
    expect(added[3]).toMatchObject({ type: 'board', target: 'new-id', label: '새 게시판' })
  })
})

describe('메뉴 관리 화면', () => {
  it('트리를 단계대로 보여 주고, 메뉴를 고르면 설정을 연다', async () => {
    get.mockReturnValue(ok(menu()))
    renderPage()
    const rows = within(await screen.findByRole('list', { name: '메뉴 구성' })).getAllByRole(
      'listitem'
    )
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('회사소개'),
      expect.stringContaining('연혁'),
      expect.stringContaining('사업영역'),
      expect.stringContaining('소식'),
    ])
    expect(screen.getByLabelText('메뉴명')).toHaveValue('회사소개')
    await userEvent.click(row('연혁'))
    expect(screen.getByLabelText('메뉴명')).toHaveValue('연혁')
    expect(screen.getByLabelText('상위 메뉴')).toHaveValue('about')
    expect(saveButton()).toBeDisabled()
  })

  it('저장 전이면 지금 메뉴를 불러왔다고 알린다', async () => {
    get.mockReturnValue(ok(menu({ saved: false })))
    renderPage()
    expect(await screen.findByText(/지금 홈페이지 메뉴를 그대로 불러왔어요/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '템플릿 기본 메뉴로 되돌리기' })
    ).not.toBeInTheDocument()
  })

  it('외부 URL 메뉴를 추가해 새 창으로 저장한다', async () => {
    get.mockReturnValue(ok(menu()))
    put.mockImplementation((_url: string, body: { nodes: MenuNode[] }) =>
      ok(menu({ nodes: body.nodes }))
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '메뉴 추가' }))
    const label = screen.getByLabelText('메뉴명')
    await user.clear(label)
    await user.type(label, '블로그')
    await user.selectOptions(screen.getByLabelText('연결 유형'), 'url')
    await user.clear(screen.getByLabelText('연결 주소'))
    await user.type(screen.getByLabelText('연결 주소'), 'https://blog.example.com')
    await user.selectOptions(screen.getByLabelText('열기 방식'), 'new')
    await user.selectOptions(screen.getByLabelText('상위 메뉴'), 'about')
    await user.click(saveButton())

    await waitFor(() => expect(put).toHaveBeenCalled())
    const nodes = put.mock.calls[0][1].nodes as MenuNode[]
    expect(nodes.map((x) => x.id)).toEqual(['about', 'business', 'b-news'])
    expect(nodes[0].children[1]).toMatchObject({
      label: '블로그',
      type: 'url',
      target: 'https://blog.example.com',
      new_window: true,
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('잘못된 주소면 저장하지 않고 알린다', async () => {
    get.mockReturnValue(ok(menu()))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '메뉴 추가' }))
    await user.selectOptions(screen.getByLabelText('연결 유형'), 'url')
    await user.clear(screen.getByLabelText('연결 주소'))
    await user.type(screen.getByLabelText('연결 주소'), 'blog.example.com')
    expect(screen.getByRole('alert')).toHaveTextContent('http://')
    await user.click(saveButton())
    expect(put).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('하위 메뉴가 있는 메뉴를 지우면 위로 옮기기 / 함께 삭제를 고른다', async () => {
    get.mockReturnValue(ok(menu()))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '선택 메뉴 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '하위 메뉴가 있는 메뉴 삭제' })
    await user.click(within(dialog).getByRole('button', { name: '하위 메뉴는 위로 옮기기' }))
    const rows = within(tree())
      .getAllByRole('listitem')
      .map((row) => row.textContent)
    expect(rows[0]).toContain('연혁')
    expect(rows.join()).not.toContain('회사소개')
    // 변경 취소로 되돌린다
    await user.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(within(tree()).getAllByRole('listitem')).toHaveLength(4)
  })

  it('위로 옮기고 숨긴 채 저장한다', async () => {
    get.mockReturnValue(ok(menu()))
    put.mockImplementation((_url: string, body: { nodes: MenuNode[] }) =>
      ok(menu({ nodes: body.nodes }))
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '사업영역 위로' }))
    await user.click(row('사업영역'))
    await user.click(screen.getByRole('checkbox', { name: /홈페이지 메뉴에 보이기/ }))
    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    const nodes = put.mock.calls[0][1].nodes as MenuNode[]
    expect(nodes[0]).toMatchObject({ id: 'business', visible: false })
  })

  it('사용 안 함 게시판에 연결하면 경고한다', async () => {
    get.mockReturnValue(ok(menu()))
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('list', { name: '메뉴 구성' })
    await user.click(row('소식'))
    await user.selectOptions(screen.getByLabelText('연결 대상'), 'old-id')
    expect(screen.getByRole('note')).toHaveTextContent('사용 안 함인 게시판이에요')
  })

  it('저장한 메뉴는 템플릿 기본 메뉴로 되돌릴 수 있다', async () => {
    get.mockReturnValue(ok(menu()))
    del.mockReturnValue(ok(menu({ saved: false })))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '템플릿 기본 메뉴로 되돌리기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/site-settings/menu'))
    expect(await screen.findByText(/지금 홈페이지 메뉴를 그대로 불러왔어요/)).toBeInTheDocument()
  })
})
