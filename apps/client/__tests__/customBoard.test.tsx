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
  hrefFor: (x?: { id?: string; q?: string; p?: number; c?: string }) => pageHref('demo', 'b/news', undefined, x),
  searchTarget: { action: '/demo/b/news', hidden: [] as [string, string][] },
  link: { pageKey: 'b/news' },
  memberEnabled: true,
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

describe('카테고리 탭 (T-149)', () => {
  const categories = [
    { id: 'c1', name: '진료' },
    { id: 'c2', name: '행사' },
  ]

  it('분류가 없으면 탭이 없다', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([post]))
    render(await CustomBoard(props('LIST')))
    expect(screen.queryByRole('navigation', { name: '카테고리' })).not.toBeInTheDocument()
  })

  it.each(['LIST', 'CARD'] as BoardType[])('%s: 고른 분류로 읽고 검색 · 페이지 · 탭 주소', async (type) => {
    fetchPublicPosts.mockResolvedValue(listOf([post], 25))
    const board = { ...boardOf(type), categories }
    render(await CustomBoard(props(type, { board, c: 'c1' })))
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', expect.objectContaining({ category: 'c1' }))
    const tabs = screen.getByRole('navigation', { name: '카테고리' })
    expect(within(tabs).getByRole('link', { name: '진료' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: '전체' })).toHaveAttribute('href', '/demo/b/news')
    expect(within(tabs).getByRole('link', { name: '행사' })).toHaveAttribute('href', '/demo/b/news?c=c2')
    expect(screen.getByRole('link', { name: /첫 글/ })).toHaveAttribute('href', '/demo/b/news/p1')
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '/demo/b/news?c=c1&p=2')
    expect(screen.getByRole('search').querySelector('input[name="c"]')).toHaveValue('c1')
  })

  it('없는 분류 주소는 전체로', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([post]))
    render(await CustomBoard(props('LIST', { board: { ...boardOf('LIST'), categories }, c: 'gone' })))
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', expect.objectContaining({ category: undefined }))
    const tabs = screen.getByRole('navigation', { name: '카테고리' })
    expect(within(tabs).getByRole('link', { name: '전체' })).toHaveAttribute('aria-current', 'page')
  })

  describe('2단계 (T-179)', () => {
    const tree = [
      { id: 'c1', name: '진료' },
      { id: 'k1', name: '임플란트', parent_id: 'c1' },
      { id: 'k2', name: '교정', parent_id: 'c1' },
      { id: 'c2', name: '행사' },
    ]
    const render2 = async (c?: string) => {
      fetchPublicPosts.mockResolvedValue(listOf([post]))
      render(await CustomBoard(props('LIST', { board: { ...boardOf('LIST'), categories: tree }, c })))
      return {
        top: screen.getByRole('list', { name: '상위 카테고리' }),
        sub: screen.queryByRole('list', { name: '하위 카테고리' }),
      }
    }

    it('첫 줄은 상위만, 하위 줄은 상위를 골라야 나온다', async () => {
      const { top, sub } = await render2()
      expect(within(top).getAllByRole('link').map((a) => a.textContent)).toEqual(['전체', '진료', '행사'])
      expect(sub).not.toBeInTheDocument()
    })

    it('상위를 고르면 하위 줄 — 상위 전체가 켜지고 하위 글까지 읽는다', async () => {
      const { top, sub } = await render2('c1')
      expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', expect.objectContaining({ category: 'c1' }))
      expect(within(top).getByRole('link', { name: '진료' })).toHaveAttribute('aria-current', 'page')
      expect(within(sub!).getAllByRole('link').map((a) => a.textContent)).toEqual(['전체', '임플란트', '교정'])
      expect(within(sub!).getByRole('link', { name: '전체' })).toHaveAttribute('href', '/demo/b/news?c=c1')
      expect(within(sub!).getByRole('link', { name: '전체' })).toHaveAttribute('aria-current', 'page')
      expect(within(sub!).getByRole('link', { name: '교정' })).toHaveAttribute('href', '/demo/b/news?c=k2')
    })

    it('하위를 고르면 상위 탭 · 그 하위 탭이 함께 켜진다', async () => {
      const { top, sub } = await render2('k1')
      expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', expect.objectContaining({ category: 'k1' }))
      expect(within(top).getByRole('link', { name: '진료' })).toHaveAttribute('aria-current', 'page')
      expect(within(sub!).getByRole('link', { name: '임플란트' })).toHaveAttribute('aria-current', 'page')
    })

    it('하위가 없는 상위는 둘째 줄이 없다', async () => {
      const { sub } = await render2('c2')
      expect(sub).not.toBeInTheDocument()
    })
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
    expect(within(item).getByText('진료 시간은?').closest('summary')).toBe(item.querySelector('summary'))
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

  it('연락처 · 이메일 · 링크는 누를 수 있고, http 가 아닌 주소는 링크로 만들지 않는다 (T-147)', async () => {
    fetchPublicPost.mockResolvedValue({
      ...detail,
      fields: [
        { key: 'p', label: '연락처', field_type: 'PHONE', value: '010-1234 5678' },
        { key: 'e', label: '메일', field_type: 'EMAIL', value: 'a@example.com' },
        { key: 'u', label: '주소', field_type: 'URL', value: 'https://example.com' },
        { key: 'x', label: '위험', field_type: 'URL', value: 'javascript:alert(1)' },
      ],
    })
    const { container } = render(await CustomBoard(props('LIST', { detailId: 'p1' })))
    const list = within(container.querySelector('dl.board-view__fields') as HTMLElement)
    expect(list.getByRole('link', { name: '010-1234 5678' })).toHaveAttribute('href', 'tel:01012345678')
    expect(list.getByRole('link', { name: 'a@example.com' })).toHaveAttribute('href', 'mailto:a@example.com')
    const site = list.getByRole('link', { name: 'https://example.com' })
    expect(site).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(list.queryByRole('link', { name: /javascript/ })).toBeNull()
    expect(list.getByText('javascript:alert(1)')).toBeInTheDocument()
  })

  describe('게시판 디자인 (T-148)', () => {
    const design = {
      columns: 4,
      image_ratio: '16:9',
      show_date: false,
      show_image: false,
      show_summary: false,
      faq_single_open: true,
      faq_first_open: true,
    } as const
    const post = {
      id: 'p1',
      title: '채용',
      is_pinned: false,
      published_at: '2026-11-01T00:00:00Z',
      thumbnail: 'http://x/a.webp',
      summary: '요약 글자',
      card_fields: [{ key: 'd', label: '부서', field_type: 'TEXT', value: '개발팀' }],
      body: [],
    }
    const listOf = () =>
      vi.mocked(fetchPublicPosts).mockResolvedValue({ total: 1, page: 1, size: 12, has_posts: true, items: [post] } as never)

    it('카드형 — 사진 · 요약 · 칸 값 · 날짜', async () => {
      listOf()
      const { container } = render(await CustomBoard(props('CARD')))
      expect(container.querySelector('.board-card--cols-3.board-card--ratio-4-3')).not.toBeNull()
      expect(container.querySelector('img.board-card__image')).toHaveAttribute('src', 'http://x/a.webp')
      expect(screen.getByText('요약 글자')).toBeInTheDocument()
      expect(screen.getByText('부서: 개발팀')).toBeInTheDocument()
      expect(container.querySelector('time')).not.toBeNull()
      // 카드 전체가 링크라 칸 값에 링크를 또 넣지 않는다
      expect(container.querySelectorAll('.board-card__link a')).toHaveLength(0)
    })

    it('카드형 — 끈 항목은 나오지 않는다', async () => {
      listOf()
      const { container } = render(await CustomBoard(props('CARD', { board: { ...boardOf('CARD'), design } })))
      expect(container.querySelector('.board-card--cols-4.board-card--ratio-16-9')).not.toBeNull()
      expect(container.querySelector('img')).toBeNull()
      expect(screen.queryByText('요약 글자')).toBeNull()
      expect(container.querySelector('time')).toBeNull()
      expect(screen.getByText('부서: 개발팀')).toBeInTheDocument()
    })

    it('갤러리형 — 줄 개수 · 비율 · 날짜', async () => {
      listOf()
      const { container } = render(await CustomBoard(props('GALLERY', { board: { ...boardOf('GALLERY'), design } })))
      expect(container.querySelector('.board-gallery--cols-4.board-gallery--ratio-16-9')).not.toBeNull()
      expect(container.querySelector('time')).toBeNull()
    })

    it('FAQ형 — 하나만 펼치기 · 첫 질문 펼침', async () => {
      listOf()
      const { container } = render(await CustomBoard(props('FAQ', { board: { ...boardOf('FAQ'), design } })))
      const item = container.querySelector('details') as HTMLDetailsElement
      expect(item).toHaveAttribute('name', 'faq-news')
      expect(item.open).toBe(true)
    })

    it('목록형 — 날짜를 끌 수 있다', async () => {
      listOf()
      const { container } = render(await CustomBoard(props('LIST', { board: { ...boardOf('LIST'), design } })))
      expect(container.querySelector('.board-list__date')).toBeNull()
    })
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
