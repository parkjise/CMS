import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { BoardType, PublicBoard } from '@cms/types'
import { useMemberStore } from '@/lib/memberStore'

const { fetchMemberPosts, fetchMemberPost, fetchPublicPosts, fetchPublicPost } = vi.hoisted(() => ({
  fetchMemberPosts: vi.fn(),
  fetchMemberPost: vi.fn(),
  fetchPublicPosts: vi.fn(),
  fetchPublicPost: vi.fn(),
}))

vi.mock('@/lib/memberBoard', async (original) => ({
  ...(await original<typeof import('@/lib/memberBoard')>()),
  fetchMemberPosts,
  fetchMemberPost,
}))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPosts,
  fetchPublicPost,
}))

import { ThemeBoardMember } from '@/components/board/ThemeBoardMember'
import { isMemberOnly, resolveBoardRoute } from '@/lib/boardRoute'
import { MemberBoardDenied } from '@/lib/memberBoard'
import type { PublicSite } from '@/lib/publicSite.types'
import { boardSeoMeta } from '@/lib/seoMeta'
import { CustomBoard } from '@/templates/hospital-a/components/board/CustomBoard'
import { CustomBoardMember } from '@/templates/hospital-a/components/board/CustomBoardMember'

const boardOf = (board_type: BoardType = 'LIST'): PublicBoard => ({
  id: 'b1',
  name: '회원 소식',
  slug: 'vip',
  description: '',
  board_type,
  read_access: 'MEMBER',
})

const post = {
  id: 'p1',
  title: '회원 글',
  is_pinned: false,
  published_at: '2026-11-04T16:00:00Z',
  thumbnail: null,
  body: null,
}
const list = { total: 1, page: 1, size: 10, has_posts: true, items: [post] }
const query = { page: 1 }

const signIn = () =>
  useMemberStore.setState({
    slug: 'demo',
    member: { id: 'm1' } as never,
    accessToken: 'token',
    status: 'ready',
  })
const signOut = () => useMemberStore.setState({ slug: 'demo', member: null, accessToken: null, status: 'ready' })

const renderCode = (board = boardOf(), extra: Partial<Parameters<typeof CustomBoardMember>[0]> = {}) =>
  render(
    <CustomBoardMember
      board={board}
      tenantSlug="demo"
      query={query}
      link={{ pageKey: 'b/vip' }}
      searchTarget={{ action: '/demo/b/vip', hidden: [] }}
      memberEnabled
      {...extra}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  signOut()
  window.history.replaceState(null, '', '/demo/b/vip?c=c1')
})

describe('회원만 읽는 게시판 — 코드형 (T-150)', () => {
  it('로그인하지 않았으면 안내와 로그인 링크(돌아올 주소), 글은 읽지 않는다', async () => {
    renderCode()
    const login = await screen.findByRole('link', { name: '로그인' })
    expect(login).toHaveAttribute('href', `/demo/member/login?next=${encodeURIComponent('/demo/b/vip?c=c1')}`)
    expect(screen.getByText('회원만 볼 수 있는 게시판입니다.')).toBeInTheDocument()
    expect(fetchMemberPosts).not.toHaveBeenCalled()
  })

  it('로그인 상태를 확인하는 동안은 확인 중', () => {
    useMemberStore.setState({ slug: 'demo', member: null, status: 'loading' as never })
    renderCode()
    expect(screen.getByText(/로그인 정보를 확인하고 있습니다/)).toBeInTheDocument()
  })

  it('회원이면 브라우저에서 읽어 목록을 그린다', async () => {
    signIn()
    fetchMemberPosts.mockResolvedValue(list)
    renderCode()
    expect(await screen.findByRole('link', { name: /회원 글/ })).toHaveAttribute('href', '/demo/b/vip/p1')
    expect(fetchMemberPosts).toHaveBeenCalledWith('demo', 'vip', expect.objectContaining({ page: 1, size: 10 }))
  })

  it('회원이면 상세도 브라우저에서', async () => {
    signIn()
    fetchMemberPost.mockResolvedValue({ ...post, body: [], fields: [], prev_id: null, next_id: null })
    renderCode(boardOf(), { query: { page: 1, detailId: 'p1' } })
    expect(await screen.findByRole('heading', { name: /회원 글/ })).toBeInTheDocument()
    expect(fetchMemberPost).toHaveBeenCalledWith('demo', 'vip', 'p1')
  })

  it('서버가 거절하면(로그인 만료 · 권한 없음) 로그인 안내', async () => {
    signIn()
    fetchMemberPosts.mockRejectedValue(new MemberBoardDenied())
    renderCode()
    expect(await screen.findByRole('link', { name: '로그인' })).toBeInTheDocument()
  })

  it('불러오기 실패 · 없는 글', async () => {
    signIn()
    fetchMemberPosts.mockRejectedValue(new Error('network'))
    const { unmount } = renderCode()
    expect(await screen.findByText(/글을 불러오지 못했습니다/)).toBeInTheDocument()
    unmount()
    fetchMemberPost.mockResolvedValue(null)
    renderCode(boardOf(), { query: { page: 1, detailId: 'gone' } })
    expect(await screen.findByText('게시글을 찾을 수 없습니다.')).toBeInTheDocument()
  })

  it('회원 기능이 꺼진 사업체는 로그인 링크 없이 안내만', async () => {
    renderCode(boardOf(), { memberEnabled: false })
    expect(await screen.findByText('지금은 볼 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
  })

  it('서버 화면(CustomBoard)은 공개 API 를 부르지 않는다', async () => {
    render(
      await CustomBoard({
        board: boardOf('CARD'),
        tenantSlug: 'demo',
        page: 1,
        detailId: 'p1',
        hrefFor: () => '/x',
        searchTarget: { action: '/demo/b/vip', hidden: [] },
        link: { pageKey: 'b/vip' },
        memberEnabled: true,
      }),
    )
    expect(fetchPublicPosts).not.toHaveBeenCalled()
    expect(fetchPublicPost).not.toHaveBeenCalled()
    expect(await screen.findByRole('link', { name: '로그인' })).toBeInTheDocument()
  })
})

describe('회원만 읽는 게시판 — 테마형 (T-150)', () => {
  const renderTheme = (memberEnabled = true) =>
    render(
      <ThemeBoardMember
        board={boardOf()}
        tenantSlug="demo"
        query={query}
        pageKey="b/vip"
        noSlug={false}
        memberEnabled={memberEnabled}
      />,
    )

  it('로그인 안내', async () => {
    renderTheme()
    expect(await screen.findByRole('link', { name: '로그인' })).toHaveAttribute(
      'href',
      expect.stringContaining('/demo/member/login?next='),
    )
  })

  it('회원이면 목록', async () => {
    signIn()
    fetchMemberPosts.mockResolvedValue(list)
    renderTheme()
    expect(await screen.findByRole('link', { name: /회원 글/ })).toHaveAttribute('href', '/demo/b/vip/p1')
  })

  it('회원 기능이 꺼졌으면 안내만', async () => {
    renderTheme(false)
    await waitFor(() => expect(screen.getByText('지금은 볼 수 없습니다.')).toBeInTheDocument())
  })
})

describe('주소 · 검색 (T-150)', () => {
  const site = { boards: [boardOf()] } as unknown as PublicSite

  it('회원 게시판의 글은 서버에서 읽지 않고, 없는 글로 404 내지 않는다', async () => {
    const route = await resolveBoardRoute(site, 'demo', ['vip', 'p1'])
    expect(route).toEqual({ board: boardOf(), detailId: 'p1', post: null })
    expect(fetchPublicPost).not.toHaveBeenCalled()
  })

  it('검색 제외', () => {
    expect(isMemberOnly(boardOf())).toBe(true)
    expect(boardSeoMeta(boardOf(), '데모').robots).toEqual({ index: false, follow: false })
    expect(boardSeoMeta({ ...boardOf(), read_access: 'PUBLIC' }, '데모').robots).toBeUndefined()
  })
})

describe('회원 토큰으로 읽기', () => {
  it('토큰을 붙이고 캐시하지 않으며, 401 · 403 은 거절', async () => {
    const actual = await vi.importActual<typeof import('@/lib/memberBoard')>('@/lib/memberBoard')
    signIn()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: list }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    // 만료 시각을 못 읽는 토큰은 갱신을 시도하므로, 갱신 없이 쓰도록 먼 미래 exp 를 넣는다
    const exp = Math.floor(Date.now() / 1000) + 3600
    useMemberStore.setState({ accessToken: `x.${btoa(JSON.stringify({ exp }))}.y` })
    await expect(actual.fetchMemberPosts('demo', 'vip', { page: 2, size: 10, category: 'c1' })).resolves.toEqual(list)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/public/site/demo/boards/vip/posts?page=2&size=10&category=c1')
    expect(init).toMatchObject({ cache: 'no-store', headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }) })
    await expect(actual.fetchMemberPost('demo', 'vip', 'p1')).rejects.toBeInstanceOf(actual.MemberBoardDenied)
    fetchSpy.mockRestore()
  })
})
