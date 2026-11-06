import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardType, PublicBoard, PublicPost } from '@cms/types'
import { useClientAuthStore } from '@/lib/authStore'
import { useMemberStore } from '@/lib/memberStore'

const { fetchMemberPost, createMemberPost, updateMemberPost, fetchMyPost, fetchPublicPost } = vi.hoisted(() => ({
  fetchMemberPost: vi.fn(),
  createMemberPost: vi.fn(),
  updateMemberPost: vi.fn(),
  fetchMyPost: vi.fn(),
  fetchPublicPost: vi.fn(),
}))

vi.mock('@/lib/memberBoard', async (original) => ({
  ...(await original<typeof import('@/lib/memberBoard')>()),
  fetchMemberPost,
  createMemberPost,
  updateMemberPost,
  fetchMyPost,
}))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPost,
}))

import { ThemeBoardSecret } from '@/components/board/ThemeBoardSecret'
import { ThemeBoardWrite } from '@/components/board/ThemeBoardWrite'
import { CustomBoard } from '@/templates/hospital-a/components/board/CustomBoard'
import { CustomBoardList } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { CustomBoardSecret } from '@/templates/hospital-a/components/board/CustomBoardSecret'
import { CustomBoardWrite } from '@/templates/hospital-a/components/board/CustomBoardWrite'

const boardOf = (board_type: BoardType = 'LIST', extra: Partial<PublicBoard> = {}): PublicBoard => ({
  id: 'b1',
  name: '고객 문의',
  slug: 'qna',
  description: '',
  board_type,
  write_access: 'MEMBER',
  allow_secret: true,
  ...extra,
})

const locked: PublicPost = {
  id: 'p1',
  title: '비밀 질문',
  is_pinned: false,
  is_secret: true,
  locked: true,
  published_at: '2026-11-06T00:00:00Z',
  body: [],
  fields: [],
  prev_id: null,
  next_id: null,
}
const opened: PublicPost = {
  ...locked,
  locked: false,
  body: [{ type: 'paragraph', content: [{ type: 'text', text: '연락처는 010-0000-0000' }] }],
}

const signIn = () =>
  useMemberStore.setState({ slug: 'demo', member: { id: 'm1' } as never, accessToken: 'token', status: 'ready' })
const signOut = () => useMemberStore.setState({ slug: 'demo', member: null, accessToken: null, status: 'ready' })

beforeEach(() => {
  vi.clearAllMocks()
  // 내 글 [수정] [삭제] 확인 — 이 테스트들에서는 남의 글
  fetchMyPost.mockResolvedValue(null)
  signOut()
  useClientAuthStore.setState({ user: null, isLoggedIn: false, flags: null })
})

describe('목록의 비밀글 (T-151-A)', () => {
  const item = {
    id: 'p1',
    title: '비밀 질문',
    is_pinned: false,
    is_secret: true,
    published_at: '2026-11-06T00:00:00Z',
    thumbnail: null,
    body: null,
    summary: null,
  }
  const list = { posts: [item], total: 1, page: 1, totalPages: 1, keyword: '' }

  it.each(['LIST', 'GALLERY', 'CARD'] as BoardType[])('%s: 제목 옆 자물쇠', (type) => {
    render(
      <CustomBoardList
        board={boardOf(type)}
        list={list}
        hrefFor={(x) => (x?.id ? `/demo/b/qna/${x.id}` : '/demo/b/qna')}
        searchTarget={{ action: '/demo/b/qna', hidden: [] }}
      />,
    )
    const link = screen.getByRole('link', { name: /비밀 질문/ })
    expect(within(link).getByRole('img', { name: '비밀글' })).toBeInTheDocument()
  })

  it('FAQ: 답변 대신 안내', () => {
    render(
      <CustomBoardList
        board={boardOf('FAQ')}
        list={list}
        hrefFor={() => '/demo/b/qna'}
        searchTarget={{ action: '/demo/b/qna', hidden: [] }}
      />,
    )
    expect(screen.getByText('비밀글입니다. 글을 쓴 회원만 볼 수 있습니다.')).toBeInTheDocument()
  })
})

describe('비밀글 상세 — 코드형 (T-151-A)', () => {
  const renderSecret = () =>
    render(<CustomBoardSecret board={boardOf()} tenantSlug="demo" post={locked} link={{ pageKey: 'b/qna' }} />)

  it('비회원은 제목과 안내 · 로그인, 내용은 없다', () => {
    renderSecret()
    expect(screen.getByRole('heading', { name: /비밀 질문/ })).toBeInTheDocument()
    expect(screen.getByText('비밀글입니다. 글을 쓴 회원만 볼 수 있습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(fetchMemberPost).not.toHaveBeenCalled()
  })

  it('쓴 회원이면 브라우저에서 다시 읽어 내용을 보여 준다', async () => {
    signIn()
    fetchMemberPost.mockResolvedValue(opened)
    renderSecret()
    expect(await screen.findByText('연락처는 010-0000-0000')).toBeInTheDocument()
    expect(screen.queryByText(/비밀글입니다/)).not.toBeInTheDocument()
    expect(fetchMemberPost).toHaveBeenCalledWith('demo', 'qna', 'p1')
  })

  it('다른 회원이면 여전히 잠겨 있다', async () => {
    signIn()
    fetchMemberPost.mockResolvedValue(locked)
    renderSecret()
    await waitFor(() => expect(fetchMemberPost).toHaveBeenCalled())
    expect(screen.getByText(/비밀글입니다/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
  })

  it('서버 화면은 잠긴 글을 비밀글 화면으로 넘긴다', async () => {
    fetchPublicPost.mockResolvedValue(locked)
    render(
      await CustomBoard({
        board: boardOf(),
        tenantSlug: 'demo',
        page: 1,
        detailId: 'p1',
        hrefFor: () => '/x',
        searchTarget: { action: '/demo/b/qna', hidden: [] },
        link: { pageKey: 'b/qna' },
        memberEnabled: true,
      }),
    )
    expect(screen.getByText(/비밀글입니다/)).toBeInTheDocument()
  })
})

describe('비밀글 상세 — 테마형 (T-151-A)', () => {
  it('잠김 → 쓴 회원이면 열림', async () => {
    const { unmount } = render(
      <ThemeBoardSecret board={boardOf()} tenantSlug="demo" post={locked} pageKey="b/qna" noSlug={false} />,
    )
    expect(screen.getByText(/비밀글입니다/)).toBeInTheDocument()
    unmount()
    signIn()
    fetchMemberPost.mockResolvedValue(opened)
    render(<ThemeBoardSecret board={boardOf()} tenantSlug="demo" post={locked} pageKey="b/qna" noSlug={false} />)
    expect(await screen.findByText('연락처는 010-0000-0000')).toBeInTheDocument()
  })
})

describe('글쓰기의 비밀글 체크 (T-151-A)', () => {
  const fill = async () => {
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
  }

  it('허용한 게시판은 체크해 보낸다', async () => {
    signIn()
    createMemberPost.mockResolvedValue({ id: 'p9', title: '제목', content: '내용', category_id: null })
    render(<CustomBoardWrite board={boardOf()} tenantSlug="demo" link={{ pageKey: 'b/qna' }} memberEnabled />)
    await fill()
    await userEvent.click(screen.getByLabelText(/비밀글로 등록/))
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() =>
      expect(createMemberPost).toHaveBeenCalledWith('demo', 'qna', expect.objectContaining({ is_secret: true })),
    )
  })

  it('허용하지 않은 게시판은 체크가 없고 보내지 않는다', async () => {
    signIn()
    createMemberPost.mockResolvedValue({ id: 'p9', title: '제목', content: '내용', category_id: null })
    render(
      <CustomBoardWrite
        board={boardOf('LIST', { allow_secret: false })}
        tenantSlug="demo"
        link={{ pageKey: 'b/qna' }}
        memberEnabled
      />,
    )
    await fill()
    expect(screen.queryByLabelText(/비밀글로 등록/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(createMemberPost).toHaveBeenCalled())
    expect(createMemberPost.mock.calls[0][2]).not.toHaveProperty('is_secret')
  })

  it('허용을 껐어도 이미 비밀글이면 고칠 때 풀 수 있다', async () => {
    signIn()
    fetchMyPost.mockResolvedValue({ id: 'p1', title: '제목', content: '내용', category_id: null, is_secret: true })
    updateMemberPost.mockResolvedValue({ id: 'p1', title: '제목', content: '내용', category_id: null })
    render(
      <ThemeBoardWrite
        board={boardOf('LIST', { allow_secret: false })}
        tenantSlug="demo"
        postId="p1"
        pageKey="b/qna"
        noSlug={false}
        memberEnabled
      />,
    )
    const box = await screen.findByLabelText(/비밀글로 등록/)
    expect(box).toBeChecked()
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(updateMemberPost).toHaveBeenCalledWith('demo', 'qna', 'p1', expect.objectContaining({ is_secret: false })),
    )
  })
})
