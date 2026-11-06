import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PublicBoard, PublicPost } from '@cms/types'
import { useClientAuthStore } from '@/lib/authStore'
import { useMemberStore } from '@/lib/memberStore'

const {
  createGuestPost,
  verifyGuestPost,
  updateGuestPost,
  deleteGuestPost,
  reportPost,
  fetchMyPost,
  fetchMemberPost,
  executeRecaptcha,
} = vi.hoisted(() => ({
  createGuestPost: vi.fn(),
  verifyGuestPost: vi.fn(),
  updateGuestPost: vi.fn(),
  deleteGuestPost: vi.fn(),
  reportPost: vi.fn(),
  fetchMyPost: vi.fn(),
  fetchMemberPost: vi.fn(),
  executeRecaptcha: vi.fn(),
}))

vi.mock('@/lib/guestBoard', async (original) => ({
  ...(await original<typeof import('@/lib/guestBoard')>()),
  createGuestPost,
  verifyGuestPost,
  updateGuestPost,
  deleteGuestPost,
  reportPost,
}))
vi.mock('@/lib/memberBoard', async (original) => ({
  ...(await original<typeof import('@/lib/memberBoard')>()),
  fetchMyPost,
  fetchMemberPost,
}))
vi.mock('@/lib/recaptcha', () => ({ executeRecaptcha }))

import { ThemeBoardDetail } from '@/components/board/ThemeBoard'
import { ThemeBoardWrite } from '@/components/board/ThemeBoardWrite'
import { GuestPasswordError } from '@/lib/guestBoard'
import { MemberPostError } from '@/lib/memberBoard'
import { CustomBoardDetail } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { CustomBoardSecret } from '@/templates/hospital-a/components/board/CustomBoardSecret'
import { CustomBoardWrite } from '@/templates/hospital-a/components/board/CustomBoardWrite'

const boardOf = (extra: Partial<PublicBoard> = {}): PublicBoard => ({
  id: 'b1',
  name: '방명록',
  slug: 'guestbook',
  description: '',
  board_type: 'LIST',
  write_access: 'MEMBER',
  allow_guest: true,
  ...extra,
})

const guestPost: PublicPost = {
  id: 'p1',
  title: '방문 후기',
  is_pinned: false,
  is_guest: true,
  published_at: '2026-11-06T00:00:00Z',
  body: [{ type: 'paragraph', content: [{ type: 'text', text: '좋았어요' }] }],
  fields: [],
  prev_id: null,
  next_id: null,
}

const assign = vi.fn()
const realLocation = window.location
const hrefFor = (x?: { id?: string }) => (x?.id ? `/demo/b/guestbook/${x.id}` : '/demo/b/guestbook')

beforeEach(() => {
  vi.clearAllMocks()
  useMemberStore.setState({ slug: 'demo', member: null, accessToken: null, status: 'ready' })
  useClientAuthStore.setState({ user: null, isLoggedIn: false, flags: null })
  executeRecaptcha.mockResolvedValue('token-1')
  fetchMyPost.mockResolvedValue(null)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, pathname: '/demo/b/guestbook/write', search: '', assign },
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
})

describe('비회원 글쓰기 — 코드형 (T-151-B)', () => {
  const renderWrite = (extra: Partial<Parameters<typeof CustomBoardWrite>[0]> = {}) =>
    render(
      <CustomBoardWrite board={boardOf()} tenantSlug="demo" link={{ pageKey: 'b/guestbook' }} memberEnabled {...extra} />,
    )

  it('로그인하지 않아도 이름 · 비밀번호 · 동의로 쓴다 (reCAPTCHA 토큰과 함께)', async () => {
    createGuestPost.mockResolvedValue({ id: 'p9' })
    renderWrite()
    await userEvent.type(screen.getByLabelText(/^이름/), '손님')
    await userEvent.type(screen.getByLabelText(/^글 비밀번호/), 'pass1234')
    await userEvent.type(screen.getByLabelText(/제목/), '방문 후기')
    await userEvent.type(screen.getByLabelText(/내용/), '좋았어요')
    await userEvent.click(screen.getByLabelText(/개인정보 수집/))
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() =>
      expect(createGuestPost).toHaveBeenCalledWith('demo', 'guestbook', {
        name: '손님',
        password: 'pass1234',
        title: '방문 후기',
        content: '좋았어요',
        category_id: null,
        agree: true,
        recaptcha_token: 'token-1',
      }),
    )
    expect(executeRecaptcha).toHaveBeenCalledWith(undefined, 'board_guest_write')
    expect(assign).toHaveBeenCalledWith('/demo/b/guestbook/p9')
  })

  it('이름 · 짧은 비밀번호 · 동의를 확인한다', async () => {
    renderWrite()
    await userEvent.type(screen.getByLabelText(/^글 비밀번호/), '12')
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByLabelText(/^이름/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^글 비밀번호/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/개인정보 수집/)).toHaveAttribute('aria-invalid', 'true')
    expect(createGuestPost).not.toHaveBeenCalled()
  })

  it('비회원 글쓰기를 허용하지 않으면 로그인 안내', () => {
    renderWrite({ board: boardOf({ allow_guest: false }) })
    expect(screen.getByText('로그인한 회원만 글을 쓸 수 있습니다.')).toBeInTheDocument()
  })

  it('로그인한 회원은 회원으로 쓴다 (이름 · 비밀번호 칸 없음)', () => {
    useMemberStore.setState({ slug: 'demo', member: { id: 'm1' } as never, accessToken: 't', status: 'ready' })
    renderWrite()
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/제목/)).toBeInTheDocument()
  })

  it('고치기 — 비밀번호를 확인하고 채운 뒤 비밀번호와 함께 저장', async () => {
    verifyGuestPost
      .mockRejectedValueOnce(new GuestPasswordError('비밀번호가 맞지 않습니다.'))
      .mockResolvedValueOnce({
        id: 'p1',
        title: '처음',
        content: '내용',
        category_id: null,
        guest_name: '손님',
        body: [],
        fields: [],
      })
    updateGuestPost.mockResolvedValue({ id: 'p1' })
    renderWrite({ postId: 'p1' })
    const password = screen.getByLabelText('글 비밀번호')
    await userEvent.type(password, 'wrong12')
    await userEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('비밀번호가 맞지 않습니다.')).toBeInTheDocument()
    await userEvent.clear(password)
    await userEvent.type(password, 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: '확인' }))
    const title = await screen.findByDisplayValue('처음')
    await userEvent.clear(title)
    await userEvent.type(title, '고친 제목')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(updateGuestPost).toHaveBeenCalledWith('demo', 'guestbook', 'p1', {
        password: 'pass1234',
        title: '고친 제목',
        content: '내용',
        category_id: null,
      }),
    )
  })

  it('회원이어도 자기 글이 아니면 비회원 글 비밀번호로 고친다', async () => {
    useMemberStore.setState({ slug: 'demo', member: { id: 'm1' } as never, accessToken: 't', status: 'ready' })
    renderWrite({ postId: 'p1' })
    expect(await screen.findByLabelText('글 비밀번호')).toBeInTheDocument()
  })

  it('서버 거절(한도 등)은 메시지로', async () => {
    createGuestPost.mockRejectedValue(new MemberPostError('비회원 글은 1시간에 5개까지 쓸 수 있습니다.'))
    renderWrite()
    await userEvent.type(screen.getByLabelText(/^이름/), '손님')
    await userEvent.type(screen.getByLabelText(/^글 비밀번호/), 'pass1234')
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
    await userEvent.click(screen.getByLabelText(/개인정보 수집/))
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('비회원 글은 1시간에 5개까지 쓸 수 있습니다.')).toBeInTheDocument()
  })
})

describe('비회원 글 상세 — 수정 · 삭제 · 신고 (T-151-B)', () => {
  const renderDetail = () =>
    render(<CustomBoardDetail board={boardOf()} post={guestPost} hrefFor={hrefFor} tenantSlug="demo" />)

  it('수정 링크와 비밀번호로 삭제', async () => {
    deleteGuestPost.mockResolvedValue({ deleted: true })
    renderDetail()
    expect(screen.getByRole('link', { name: '수정' })).toHaveAttribute('href', '/demo/b/guestbook/p1/edit')
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.type(screen.getByLabelText('글 비밀번호'), 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(deleteGuestPost).toHaveBeenCalledWith('demo', 'guestbook', 'p1', 'pass1234'))
    expect(assign).toHaveBeenCalledWith('/demo/b/guestbook')
  })

  it('비밀번호가 틀리면 알려 주고 그대로', async () => {
    deleteGuestPost.mockRejectedValue(new GuestPasswordError('비밀번호가 맞지 않습니다.'))
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.type(screen.getByLabelText('글 비밀번호'), 'wrong12')
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('비밀번호가 맞지 않습니다.')
    expect(assign).not.toHaveBeenCalled()
  })

  it('신고 — 사유를 골라 보낸다', async () => {
    reportPost.mockResolvedValue({ reported: true, hidden: false })
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /신고/ }))
    await userEvent.click(screen.getByLabelText('욕설 · 비방'))
    await userEvent.type(screen.getByLabelText('자세한 내용 (선택)'), '반복 욕설')
    await userEvent.click(screen.getByRole('button', { name: '신고하기' }))
    await waitFor(() => expect(reportPost).toHaveBeenCalledWith('demo', 'guestbook', 'p1', 'ABUSE', '반복 욕설'))
    expect(await screen.findByText('신고했습니다. 관리자가 확인합니다.')).toBeInTheDocument()
  })

  it('이미 신고했으면 서버 메시지', async () => {
    reportPost.mockRejectedValue(new MemberPostError('이미 신고한 글입니다.'))
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /신고/ }))
    await userEvent.click(screen.getByRole('button', { name: '신고하기' }))
    expect(await screen.findByText('이미 신고한 글입니다.')).toBeInTheDocument()
  })

  it('회원 · 관리자 글에는 비회원 버튼이 없다', () => {
    render(
      <CustomBoardDetail board={boardOf()} post={{ ...guestPost, is_guest: false }} hrefFor={hrefFor} tenantSlug="demo" />,
    )
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /신고/ })).toBeInTheDocument()
  })
})

describe('비회원 비밀글 (T-151-B)', () => {
  const locked: PublicPost = { ...guestPost, is_secret: true, locked: true, body: [] }

  it('코드형 — 비밀번호로 연다', async () => {
    verifyGuestPost.mockResolvedValue({
      id: 'p1',
      title: '방문 후기',
      content: '비밀 내용',
      category_id: null,
      is_secret: true,
      guest_name: '손님',
      body: [{ type: 'paragraph', content: [{ type: 'text', text: '비밀 내용' }] }],
      fields: [],
    })
    render(<CustomBoardSecret board={boardOf()} tenantSlug="demo" post={locked} link={{ pageKey: 'b/guestbook' }} />)
    expect(screen.queryByText('비밀 내용')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('글 비밀번호'), 'pass1234')
    await userEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('비밀 내용')).toBeInTheDocument()
    expect(fetchMemberPost).not.toHaveBeenCalled()
  })
})

describe('테마형 (T-151-B)', () => {
  it('비회원 글쓰기', async () => {
    createGuestPost.mockResolvedValue({ id: 'p9' })
    render(<ThemeBoardWrite board={boardOf()} tenantSlug="demo" pageKey="b/guestbook" noSlug={false} memberEnabled />)
    await userEvent.type(screen.getByLabelText(/^이름/), '손님')
    await userEvent.type(screen.getByLabelText(/^글 비밀번호/), 'pass1234')
    await userEvent.type(screen.getByLabelText(/제목/), '제목')
    await userEvent.type(screen.getByLabelText(/내용/), '내용')
    await userEvent.click(screen.getByLabelText(/개인정보 수집/))
    await userEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/demo/b/guestbook/p9'))
  })

  it('상세의 비회원 버튼 · 신고', () => {
    render(<ThemeBoardDetail board={boardOf()} post={guestPost} hrefFor={hrefFor} tenantSlug="demo" />)
    expect(screen.getByRole('link', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /신고/ })).toBeInTheDocument()
  })
})
