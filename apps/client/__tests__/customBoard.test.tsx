import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BoardType, PublicBoard } from '@cms/types'
import { useClientAuthStore } from '@/lib/authStore'
import { pageHref } from '@/templates/shared/contracts'

const { fetchPublicPosts, fetchPublicPost } = vi.hoisted(() => ({
  fetchPublicPosts: vi.fn(),
  fetchPublicPost: vi.fn(),
}))

vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPosts,
  fetchPublicPost,
}))

import { CustomBoard } from '@/templates/hospital-a/components/board/CustomBoard'

const boardOf = (board_type: BoardType, description = ''): PublicBoard => ({
  id: 'b1',
  name: '병원 소식',
  slug: 'news',
  description,
  board_type,
})

const props = (board_type: BoardType, extra = {}) => ({
  board: boardOf(board_type),
  tenantSlug: 'demo',
  page: 1,
  hrefFor: (x?: { id?: string; q?: string; p?: number }) => pageHref('demo', 'b/news', undefined, x),
  searchTarget: { action: '/demo/b/news', hidden: [] as [string, string][] },
  ...extra,
})

const post = {
  id: 'p1',
  title: '첫 글',
  is_pinned: false,
  published_at: '2026-11-04T16:00:00Z',
  thumbnail: null,
  body: null,
}
const listOf = (items: unknown[], total = items.length) => ({
  total,
  page: 1,
  size: 10,
  has_posts: total > 0,
  items,
})

beforeEach(() => {
  vi.clearAllMocks()
  useClientAuthStore.setState({ user: null, isLoggedIn: false, flags: null })
})

describe('목록형', () => {
  it('글 · 게시판 이름 · 상세 주소, 공지 문구가 없다', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([post]))
    render(await CustomBoard(props('LIST')))
    expect(screen.getByRole('heading', { name: '병원 소식' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /첫 글/ })).toHaveAttribute('href', '/demo/b/news/p1')
    expect(screen.getByLabelText('병원 소식 검색')).toBeInTheDocument()
    expect(screen.queryByText(/공지사항/)).not.toBeInTheDocument()
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 10, q: undefined })
  })

  it('설명이 있으면 보여 준다', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([post]))
    render(await CustomBoard(props('LIST', { board: boardOf('LIST', '병원의 새 소식') })))
    expect(screen.getByText('병원의 새 소식')).toBeInTheDocument()
  })

  it('글이 없으면 빈 안내 — 공지 문구가 아니다', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([]))
    render(await CustomBoard(props('LIST')))
    expect(screen.getByText('등록된 글이 없습니다.')).toBeInTheDocument()
  })

  it('API 실패에도 화면이 깨지지 않는다', async () => {
    fetchPublicPosts.mockResolvedValue(null)
    render(await CustomBoard(props('LIST')))
    expect(screen.getByText('등록된 글이 없습니다.')).toBeInTheDocument()
  })

  it('지난 주소의 페이지가 사라졌으면 마지막 페이지', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([post], 11))
    render(await CustomBoard(props('LIST', { page: 9 })))
    expect(fetchPublicPosts).toHaveBeenLastCalledWith('demo', 'news', { page: 2, size: 10, q: undefined })
  })

  it('관리자에게는 이 게시판의 글쓰기 링크', async () => {
    useClientAuthStore.setState({
      user: { role: 'TENANT_ADMIN' },
      isLoggedIn: true,
      flags: { BOARD_MANAGER: true },
    } as never)
    fetchPublicPosts.mockResolvedValue(listOf([post]))
    render(await CustomBoard(props('LIST')))
    expect(screen.getByRole('link', { name: '글쓰기' }).getAttribute('href')).toMatch(
      /\/admin\/boards\?write=news$/,
    )
  })
})

describe('갤러리형', () => {
  it('첫 사진을 보여 주고, 사진 없는 글은 빈 칸', async () => {
    fetchPublicPosts.mockResolvedValue(
      listOf([{ ...post, thumbnail: 'http://x/a.webp' }, { ...post, id: 'p2', title: '글만' }]),
    )
    const { container } = render(await CustomBoard(props('GALLERY')))
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 12, q: undefined })
    expect(container.querySelector('img.board-gallery__image')).toHaveAttribute('src', 'http://x/a.webp')
    expect(container.querySelector('.board-gallery__image--empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /글만/ })).toHaveAttribute('href', '/demo/b/news/p2')
  })

  it('검색 결과가 없으면 안내', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([]))
    render(await CustomBoard(props('GALLERY', { q: '없는 말' })))
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument()
  })
})

describe('FAQ형', () => {
  it('질문을 펼치면 답변 — 스크립트 글자는 실행하지 않고 글자로', async () => {
    fetchPublicPosts.mockResolvedValue(
      listOf([{ ...post, title: '진료 시간은?', body: [{ type: 'p', text: '<script>x</script> 9시' }] }]),
    )
    const { container } = render(await CustomBoard(props('FAQ')))
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 20, q: undefined })
    const item = container.querySelector('details.board-faq__item') as HTMLElement
    expect(within(item).getByText('진료 시간은?').tagName).toBe('SUMMARY')
    expect(item).toHaveTextContent('<script>x</script> 9시')
    expect(item.querySelector('script')).toBeNull()
  })
})

describe('상세', () => {
  const detail = {
    ...post,
    body: [{ type: 'p', text: '본문' }],
    prev_id: 'p0',
    next_id: null,
  }

  it.each(['LIST', 'GALLERY', 'FAQ'] as const)('%s — 게시판 이름 배지 · 이전 글 · 목록', async (type) => {
    fetchPublicPost.mockResolvedValue(detail)
    render(await CustomBoard(props(type, { detailId: 'p1' })))
    expect(fetchPublicPost).toHaveBeenCalledWith('demo', 'news', 'p1')
    expect(screen.getByText('병원 소식')).toHaveClass('board-view__badge')
    expect(screen.queryByText('공지사항')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /이전 게시글/ })).toHaveAttribute('href', '/demo/b/news/p0')
    expect(screen.getByRole('link', { name: '목록보기' })).toHaveAttribute('href', '/demo/b/news')
  })

  it('칸 값 — 이름 · 별점 · 예/아니오 · 사진, 스크립트는 글자로', async () => {
    fetchPublicPost.mockResolvedValue({
      ...detail,
      fields: [
        { key: 'r', label: '별점', field_type: 'RATING', value: 4 },
        { key: 'b', label: '재방문', field_type: 'BOOLEAN', value: false },
        { key: 'm', label: '과목', field_type: 'MULTI_SELECT', value: ['내과', '외과'] },
        { key: 'i', label: '사진', field_type: 'IMAGE', value: 'http://x/a.webp' },
        { key: 't', label: '메모', field_type: 'TEXTAREA', value: '<script>x</script>' },
      ],
    })
    const { container } = render(await CustomBoard(props('LIST', { detailId: 'p1' })))
    const list = container.querySelector('dl.board-view__fields') as HTMLElement
    expect(within(list).getByText('★★★★☆')).toBeInTheDocument()
    expect(within(list).getByText('아니오')).toBeInTheDocument()
    expect(within(list).getByText('내과, 외과')).toBeInTheDocument()
    expect(within(list).getByRole('img', { name: '사진' })).toHaveAttribute('src', 'http://x/a.webp')
    expect(within(list).getByText('<script>x</script>')).toBeInTheDocument()
    expect(list.querySelector('script')).toBeNull()
  })

  it('칸이 없으면 목록을 그리지 않는다', async () => {
    fetchPublicPost.mockResolvedValue(detail)
    const { container } = render(await CustomBoard(props('LIST', { detailId: 'p1' })))
    expect(container.querySelector('dl')).toBeNull()
  })

  it('관리자에게만 [수정] — 그 글로', async () => {
    fetchPublicPost.mockResolvedValue(detail)
    const { unmount } = render(await CustomBoard(props('LIST', { detailId: 'p1' })))
    expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument()
    unmount()
    useClientAuthStore.setState({
      user: { role: 'TENANT_ADMIN' },
      isLoggedIn: true,
      flags: { BOARD_MANAGER: true },
    } as never)
    render(await CustomBoard(props('LIST', { detailId: 'p1' })))
    expect(screen.getByRole('link', { name: '수정' }).getAttribute('href')).toMatch(
      /\/admin\/boards\?write=news&post=p1$/,
    )
  })

  it('글이 없으면 안내', async () => {
    fetchPublicPost.mockResolvedValue(null)
    render(await CustomBoard(props('LIST', { detailId: 'gone' })))
    expect(screen.getByText('게시글을 찾을 수 없습니다.')).toBeInTheDocument()
  })
})
