import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardType, PublicBoard } from '@cms/types'
import { useClientAuthStore } from '@/lib/authStore'
import { useMemberStore } from '@/lib/memberStore'

const { createMemberPost, updateMemberPost, deleteMemberPost, fetchMyPost, fetchPublicPost } = vi.hoisted(() => ({
  createMemberPost: vi.fn(),
  updateMemberPost: vi.fn(),
  deleteMemberPost: vi.fn(),
  fetchMyPost: vi.fn(),
  fetchPublicPost: vi.fn(),
}))

vi.mock('@/lib/memberBoard', async (original) => ({
  ...(await original<typeof import('@/lib/memberBoard')>()),
  createMemberPost,
  updateMemberPost,
  deleteMemberPost,
  fetchMyPost,
}))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPost,
}))

import { ThemeMemberPostActions } from '@/components/board/ThemeMemberLinks'
import { ThemeBoardWrite } from '@/components/board/ThemeBoardWrite'
import { boardScreen, isFormScreen, resolveBoardRoute } from '@/lib/boardRoute'
import { MemberBoardDenied, MemberPostError } from '@/lib/memberBoard'
import type { PublicSite } from '@/lib/publicSite.types'
import { CustomBoardList } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { CustomBoardWrite } from '@/templates/hospital-a/components/board/CustomBoardWrite'
import { MemberPostActions } from '@/templates/hospital-a/components/board/MemberPostActions'

const boardOf = (extra: Partial<PublicBoard> = {}, board_type: BoardType = 'LIST'): PublicBoard => ({
  id: 'b1',
  name: '자유게시판',
  slug: 'free',
  description: '',
  board_type,
  write_access: 'MEMBER',
  ...extra,
})

const assign = vi.fn()
const realLocation = window.location

const signIn = () =>
  useMemberStore.setState({ slug: 'demo', member: { id: 'm1' } as never, accessToken: 'token', status: 'ready' })
const signOut = () => useMemberStore.setState({ slug: 'demo', member: null, accessToken: null, status: 'ready' })

const renderWrite = (extra: Partial<Parameters<typeof CustomBoardWrite>[0]> = {}) =>
  render(
    <CustomBoardWrite board={boardOf()} tenantSlug="demo" link={{ pageKey: 'b/free' }} memberEnabled {...extra} />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  signOut()
  useClientAuthStore.setState({ user: null, isLoggedIn: false, flags: null })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, pathname: '/demo/b/free/write', search: '', assign },
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
})

describe('주소 (T-150-B)', () => {
  const site = (board: PublicBoard) => ({ boards: [board] }) as unknown as PublicSite

  it('회원 글쓰기 게시판만 write · {글}/edit 를 연다', async () => {
    expect(await resolveBoardRoute(site(boardOf()), 'demo', ['free', 'write'])).toMatchObject({ detailId: 'write' })
    expect(await resolveBoardRoute(site(boardOf()), 'demo', ['free', 'p1', 'edit'])).toMatchObject({
      detailId: 'p1/edit',
      post: null,
    })
    const adminOnly = boardOf({ write_access: 'ADMIN' })
    expect(await resolveBoardRoute(site(adminOnly), 'demo', ['free', 'write'])).toBeNull()
    expect(await resolveBoardRoute(site(adminOnly), 'demo', ['free', 'p1', 'edit'])).toBeNull()
    expect(await resolveBoardRoute(site(boardOf()), 'demo', ['free', 'p1', 'other'])).toBeNull()
    expect(fetchPublicPost).not.toHaveBeenCalled()
  })

  it('화면 구분 · 검색 제외', () => {
    expect(boardScreen()).toEqual({ kind: 'list' })
    expect(boardScreen('p1')).toEqual({ kind: 'detail', postId: 'p1' })
    expect(boardScreen('write')).toEqual({ kind: 'write' })
    expect(boardScreen('p1/edit')).toEqual({ kind: 'edit', postId: 'p1' })
    expect(isFormScreen('write')).toBe(true)
    expect(isFormScreen('p1')).toBe(false)
  })
})

describe('회원 글쓰기 — 코드형 (T-150-B)', () => {
  it('로그인하지 않았으면 로그인 안내', async () => {
    renderWrite()
    expect(await screen.findByText('로그인한 회원만 글을 쓸 수 있습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute(
      'href',
      `/demo/member/login?next=${encodeURIComponent('/demo/b/free/write')}`,
    )
  })

  it('회원 기능이 꺼졌으면 안내만', () => {
    signIn()
    renderWrite({ memberEnabled: false })
    expect(screen.getByText('지금은 볼 수 없습니다.')).toBeInTheDocument()
  })

  it('빈 칸은 보내지 않고 알려 준다', async () => {
    signIn()
    renderWrite()
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByLabelText(/제목/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/내용/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('입력한 내용을 확인해 주세요.')
    expect(createMemberPost).not.toHaveBeenCalled()
  })

  it('등록하면 분류와 함께 보내고 그 글로 간다', async () => {
    signIn()
    createMemberPost.mockResolvedValue({ id: 'p9', title: '질문', content: '내용', category_id: 'c1' })
    renderWrite({ board: boardOf({ categories: [{ id: 'c1', name: '질문' }] }) })
    await userEvent.selectOptions(screen.getByLabelText('카테고리'), 'c1')
    await userEvent.type(screen.getByLabelText(/제목/), '  궁금합니다  ')
    await userEvent.type(screen.getByLabelText(/내용/), '첫 줄{enter}둘째 줄')
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() =>
      expect(createMemberPost).toHaveBeenCalledWith('demo', 'free', {
        title: '궁금합니다',
        content: '첫 줄\n둘째 줄',
        category_id: 'c1',
      }),
    )
    expect(assign).toHaveBeenCalledWith('/demo/b/free/p9')
  })

  it('서버가 거절하면 그 메시지 (1시간 한도 등)', async () => {
    signIn()
    createMemberPost.mockRejectedValue(new MemberPostError('글은 1시간에 10개까지 쓸 수 있습니다.'))
    renderWrite()
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('글은 1시간에 10개까지 쓸 수 있습니다.')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('로그인이 풀렸으면 로그인 안내로', async () => {
    signIn()
    createMemberPost.mockRejectedValue(new MemberBoardDenied())
    renderWrite()
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByRole('link', { name: '로그인' })).toBeInTheDocument()
  })

  it('고치기 — 내 글을 불러와 저장한다', async () => {
    signIn()
    fetchMyPost.mockResolvedValue({ id: 'p1', title: '처음 제목', content: '처음 내용', category_id: null })
    updateMemberPost.mockResolvedValue({ id: 'p1', title: '새 제목', content: '처음 내용', category_id: null })
    renderWrite({ postId: 'p1' })
    const title = await screen.findByDisplayValue('처음 제목')
    await userEvent.clear(title)
    await userEvent.type(title, '새 제목')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(updateMemberPost).toHaveBeenCalledWith('demo', 'free', 'p1', {
        title: '새 제목',
        content: '처음 내용',
        category_id: null,
      }),
    )
    expect(assign).toHaveBeenCalledWith('/demo/b/free/p1')
  })

  it('남의 글 · 지운 글은 고칠 수 없다', async () => {
    signIn()
    fetchMyPost.mockResolvedValue(null)
    renderWrite({ postId: 'p1' })
    expect(await screen.findByText('고칠 수 있는 글이 아닙니다.')).toBeInTheDocument()
  })
})

describe('내 글 [수정] [삭제] (T-150-B)', () => {
  const props = {
    board: boardOf(),
    tenantSlug: 'demo',
    postId: 'p1',
    editHref: '/demo/b/free/p1/edit',
    listHref: '/demo/b/free',
  }

  it('내 글이면 수정 · 삭제, 삭제하면 목록으로', async () => {
    signIn()
    fetchMyPost.mockResolvedValue({ id: 'p1', title: '글', content: '내용', category_id: null })
    deleteMemberPost.mockResolvedValue({ deleted: true })
    render(<MemberPostActions {...props} />)
    expect(await screen.findByRole('link', { name: '수정' })).toHaveAttribute('href', '/demo/b/free/p1/edit')
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(deleteMemberPost).toHaveBeenCalledWith('demo', 'free', 'p1'))
    expect(assign).toHaveBeenCalledWith('/demo/b/free')
  })

  it('남의 글 · 비회원이면 아무것도 없다', async () => {
    render(<MemberPostActions {...props} />)
    expect(fetchMyPost).not.toHaveBeenCalled()
    signIn()
    fetchMyPost.mockResolvedValue(null)
    await waitFor(() => expect(fetchMyPost).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('회원 글쓰기가 아닌 게시판은 묻지 않는다', () => {
    signIn()
    render(<MemberPostActions {...props} board={boardOf({ write_access: 'ADMIN' })} />)
    expect(fetchMyPost).not.toHaveBeenCalled()
  })

  it('테마형도 같다', async () => {
    signIn()
    fetchMyPost.mockResolvedValue({ id: 'p1', title: '글', content: '내용', category_id: null })
    render(<ThemeMemberPostActions {...props} />)
    expect(await screen.findByRole('link', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})

describe('목록의 [글쓰기] (T-150-B)', () => {
  const list = { posts: [], total: 0, page: 1, totalPages: 1, keyword: '' }
  const renderList = (board: PublicBoard) =>
    render(
      <CustomBoardList
        board={board}
        list={list}
        hrefFor={(x) => (x?.id ? `/demo/b/free/${x.id}` : '/demo/b/free')}
        searchTarget={{ action: '/demo/b/free', hidden: [] }}
      />,
    )

  it('회원 글쓰기 게시판이면 글쓰기 주소', () => {
    renderList(boardOf())
    expect(screen.getByRole('link', { name: '글쓰기' })).toHaveAttribute('href', '/demo/b/free/write')
  })

  it('관리자에게는 회원 글쓰기 버튼을 보이지 않는다', () => {
    useClientAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never, isLoggedIn: true })
    renderList(boardOf())
    const links = screen.queryAllByRole('link').map((link) => link.getAttribute('href'))
    expect(links).not.toContain('/demo/b/free/write')
  })

  it('관리자만 쓰는 게시판은 없다', () => {
    renderList(boardOf({ write_access: 'ADMIN' }))
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument()
  })
})

describe('회원 글쓰기 — 테마형 (T-150-B)', () => {
  it('등록하면 그 글로 간다', async () => {
    signIn()
    createMemberPost.mockResolvedValue({ id: 'p9', title: '제목', content: '내용', category_id: null })
    render(<ThemeBoardWrite board={boardOf()} tenantSlug="demo" pageKey="b/free" noSlug={false} memberEnabled />)
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/demo/b/free/p9'))
  })

  it('로그인 안내', () => {
    render(<ThemeBoardWrite board={boardOf()} tenantSlug="demo" pageKey="b/free" noSlug={false} memberEnabled />)
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
  })
})

describe('회원 글 API', () => {
  it('401 은 로그인 풀림, 그 밖의 거절은 서버 메시지', async () => {
    const actual = await vi.importActual<typeof import('@/lib/memberBoard')>('@/lib/memberBoard')
    const exp = Math.floor(Date.now() / 1000) + 3600
    useMemberStore.setState({
      slug: 'demo',
      member: { id: 'm1' } as never,
      accessToken: `x.${btoa(JSON.stringify({ exp }))}.y`,
      status: 'ready',
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'p1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: '글은 1시간에 10개까지 쓸 수 있습니다.' } }), { status: 429 }),
      )
    const input = { title: '제목', content: '내용', category_id: null }
    await expect(actual.createMemberPost('demo', 'free', input)).resolves.toEqual({ id: 'p1' })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/public/site/demo/boards/free/posts')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(input) })
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
    await expect(actual.updateMemberPost('demo', 'free', 'p1', input)).rejects.toBeInstanceOf(actual.MemberBoardDenied)
    await expect(actual.deleteMemberPost('demo', 'free', 'p1')).rejects.toThrow('1시간에 10개')
    fetchSpy.mockRestore()
  })
})
