import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicSection } from '@/lib/publicSite.types'
import { pageHref } from '@/templates/shared/contracts'
import { hospitalASample } from '@/templates/hospital-a/sample-content'
import { useClientAuthStore } from '@/lib/authStore'

const { fetchPublicPosts, fetchPublicPost } = vi.hoisted(() => ({
  fetchPublicPosts: vi.fn(),
  fetchPublicPost: vi.fn(),
}))

vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPosts,
  fetchPublicPost,
}))

import { NoticeBoardLive } from '@/templates/hospital-a/components/board/NoticeBoardLive'
import { NoticeLatest } from '@/templates/hospital-a/components/sections/NoticeLatest'
import { postDate } from '@/lib/publicPosts'

const settingsOf = (type: string, page: string): PublicSection['settings'] => {
  const s = hospitalASample.pages[page].find((x) => x.section_type === type)!
  return Object.entries(s.settings).map(([k, v]) => ({
    field_key: k,
    field_value: typeof v === 'string' ? v : JSON.stringify(v),
    value_type: typeof v === 'string' ? 'STRING' : 'JSON',
  }))
}

const section = (type: string, page: string, emptyItems = false): PublicSection => ({
  id: 'real-section',
  section_type: type as PublicSection['section_type'],
  label: type,
  display_order: 1,
  is_active: true,
  settings: settingsOf(type, page).map((s) =>
    emptyItems && s.field_key === 'items' ? { ...s, field_value: '[]' } : s,
  ),
})

const props = (overrides: Partial<Parameters<typeof NoticeBoardLive>[0]> = {}) => ({
  section: section('BOARD', 'notice'),
  editable: true,
  tenantSlug: 'demo',
  page: 1,
  hrefFor: (extra?: { id?: string; q?: string; p?: number }) =>
    pageHref('demo', 'notice', undefined, extra),
  searchTarget: { action: '/demo/notice', hidden: [] as [string, string][] },
  ...overrides,
})

const post = {
  id: 'post-1',
  title: '실제 공지',
  is_pinned: true,
  published_at: '2026-11-04T16:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  useClientAuthStore.setState({ user: null, isLoggedIn: false, flags: null })
})

describe('공지 페이지 (T-139)', () => {
  it('공개 글이 있으면 샘플 대신 실제 글', async () => {
    fetchPublicPosts.mockResolvedValue({ total: 1, page: 1, size: 10, has_posts: true, items: [post] })
    render(await NoticeBoardLive(props()))
    const link = screen.getByRole('link', { name: /실제 공지/ })
    expect(link).toHaveAttribute('href', '/demo/notice/post-1')
    expect(screen.queryByText('홈페이지 리뉴얼 오픈 안내')).not.toBeInTheDocument()
    expect(screen.getByText('공지')).toBeInTheDocument()
  })

  it('공개 글이 없으면 샘플', async () => {
    fetchPublicPosts.mockResolvedValue({ total: 0, page: 1, size: 10, has_posts: false, items: [] })
    render(await NoticeBoardLive(props()))
    expect(screen.getByRole('link', { name: /홈페이지 리뉴얼 오픈 안내/ })).toBeInTheDocument()
  })

  it('게시판이 아직 없거나 API 가 실패해도 샘플로 그린다', async () => {
    fetchPublicPosts.mockResolvedValue(null)
    render(await NoticeBoardLive(props()))
    expect(screen.getByRole('link', { name: /홈페이지 리뉴얼 오픈 안내/ })).toBeInTheDocument()
  })

  it('샘플을 비운 뒤 글을 다 지우면 빈 안내 — 샘플이 돌아오지 않는다', async () => {
    fetchPublicPosts.mockResolvedValue({ total: 0, page: 1, size: 10, has_posts: false, items: [] })
    render(await NoticeBoardLive(props({ section: section('BOARD', 'notice', true) })))
    expect(screen.getByText('등록된 공지가 없습니다.')).toBeInTheDocument()
  })

  it('검색 결과가 없어도 샘플로 돌아가지 않는다', async () => {
    fetchPublicPosts.mockResolvedValue({ total: 0, page: 1, size: 10, has_posts: true, items: [] })
    render(await NoticeBoardLive(props({ q: '없는말' })))
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument()
    expect(fetchPublicPosts.mock.calls[0][2]).toMatchObject({ q: '없는말' })
  })

  it('없어진 페이지 주소면 마지막 페이지를 다시 읽는다', async () => {
    fetchPublicPosts
      .mockResolvedValueOnce({ total: 11, page: 9, size: 10, has_posts: true, items: [] })
      .mockResolvedValueOnce({ total: 11, page: 2, size: 10, has_posts: true, items: [post] })
    render(await NoticeBoardLive(props({ page: 9 })))
    expect(fetchPublicPosts.mock.calls[1][2]).toMatchObject({ page: 2 })
    expect(screen.getByRole('link', { name: /실제 공지/ })).toBeInTheDocument()
  })

  it('글 상세 — 블록 본문 · 이전 · 다음', async () => {
    fetchPublicPost.mockResolvedValue({
      ...post,
      body: [
        { type: 'p', text: '<script>alert(1)</script> **굵게**' },
        { type: 'ul', items: ['같은 줄', '같은 줄'] },
        { type: 'image', src: '/a.webp', alt: '사진 설명' },
      ],
      prev_id: 'old',
      next_id: null,
    })
    const { container } = render(await NoticeBoardLive(props({ detailId: 'post-1' })))
    expect(screen.getByRole('heading', { name: /실제 공지/ })).toBeInTheDocument()
    expect(screen.getByAltText('사진 설명')).toHaveAttribute('src', '/a.webp')
    expect(screen.getAllByRole('listitem').filter((li) => li.textContent === '같은 줄')).toHaveLength(2)
    // 글자로만 보이고 태그가 되지 않는다
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /이전 게시글/ })).toHaveAttribute('href', '/demo/notice/old')
  })

  it('없는 글이면 샘플 글을 찾고, 그것도 없으면 안내', async () => {
    fetchPublicPost.mockResolvedValue(null)
    render(await NoticeBoardLive(props({ detailId: 'n1' })))
    expect(screen.getByRole('heading', { name: /홈페이지 리뉴얼 오픈 안내/ })).toBeInTheDocument()
  })

  it('비공개 · 삭제 글 주소는 찾을 수 없다고 한다', async () => {
    fetchPublicPost.mockResolvedValue(null)
    render(await NoticeBoardLive(props({ detailId: 'gone', section: section('BOARD', 'notice', true) })))
    expect(screen.getByText('게시글을 찾을 수 없습니다.')).toBeInTheDocument()
  })
})

describe('[글쓰기] 버튼', () => {
  const listed = () =>
    fetchPublicPosts.mockResolvedValue({ total: 1, page: 1, size: 10, has_posts: true, items: [post] })

  it('방문자에게는 없다', async () => {
    listed()
    render(await NoticeBoardLive(props()))
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument()
  })

  it('관리자는 글쓰기 화면으로 간다', async () => {
    listed()
    useClientAuthStore.setState({
      user: { role: 'TENANT_ADMIN' } as never,
      isLoggedIn: true,
      flags: { BOARD_MANAGER: true },
    })
    render(await NoticeBoardLive(props()))
    expect(screen.getByRole('link', { name: '글쓰기' }).getAttribute('href')).toContain(
      '/admin/boards?write=notice',
    )
  })

  it('보기 전용 계정 · 기능 꺼짐이면 없다', async () => {
    listed()
    useClientAuthStore.setState({
      user: { role: 'TENANT_VIEWER' } as never,
      isLoggedIn: true,
      flags: { BOARD_MANAGER: true },
    })
    const { unmount } = render(await NoticeBoardLive(props()))
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument()
    unmount()

    useClientAuthStore.setState({
      user: { role: 'TENANT_ADMIN' } as never,
      flags: { BOARD_MANAGER: false },
    })
    render(await NoticeBoardLive(props()))
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument()
  })
})

describe('메인 최신 공지 (T-139)', () => {
  const home = (latest: Parameters<typeof NoticeLatest>[0]['latest']) => (
    <NoticeLatest
      section={section('NOTICE_LATEST', 'home')}
      editable
      tenantSlug="demo"
      latest={latest}
      listHref="/demo/notice"
      itemHref={(id) => `/demo/notice/${id}`}
    />
  )

  it('공개 글이 있으면 실제 글', () => {
    render(home({ total: 1, page: 1, size: 4, has_posts: true, items: [post] }))
    expect(screen.getByRole('link', { name: /실제 공지/ })).toHaveAttribute('href', '/demo/notice/post-1')
    expect(screen.queryByText('연말연시 운영 시간 안내')).not.toBeInTheDocument()
  })

  it.each([[null], [undefined], [{ total: 0, page: 1, size: 4, has_posts: false, items: [] }]])(
    '공개 글이 없으면 샘플 (%s)',
    (latest) => {
      render(home(latest))
      expect(screen.getByText('연말연시 운영 시간 안내')).toBeInTheDocument()
    },
  )
})

describe('공개일', () => {
  it('한국 시간 날짜로 보여 준다', () => {
    expect(postDate('2026-11-04T16:00:00Z')).toBe('2026-11-05')
  })
})
