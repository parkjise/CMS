import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BoardType, PublicBoard } from '@cms/types'
import type { PublicSite } from '@/lib/publicSite.types'

const { fetchPublicSite, fetchPublicPost, fetchPublicPosts, hostHeader } = vi.hoisted(() => ({
  fetchPublicSite: vi.fn(),
  fetchPublicPost: vi.fn(),
  fetchPublicPosts: vi.fn(),
  hostHeader: { value: null as string | null },
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(hostHeader.value ? { 'x-site-custom-host': hostHeader.value } : {}),
}))
vi.mock('@/lib/publicSite', () => ({ fetchPublicSite }))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPost,
  fetchPublicPosts,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/layout/FloatingButtons', () => ({ FloatingButtons: () => null }))

import ThemeBoardPage, { generateMetadata } from '@/app/[tenant_slug]/b/[...path]/page'
import { TemplateSwitching } from '@/templates/shared/TemplateSwitching'

const boardOf = (board_type: BoardType, slug = 'news', description = ''): PublicBoard => ({
  id: `id-${slug}`,
  name: '병원 소식',
  slug,
  description,
  board_type,
})

const siteWith = (boards: PublicBoard[], renderer = 'theme'): PublicSite =>
  ({
    tenant: { id: 't', slug: 'demo', name: '데모', custom_domain: 'oo.example' },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template: { renderer, code: renderer === 'code' ? 'TPL_HOSPITAL_A' : 'HOSPITAL_CLEAN' },
    boards,
  }) as unknown as PublicSite

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

const props = (path: string[], searchParams = {}) => ({
  params: Promise.resolve({ tenant_slug: 'demo', path }),
  searchParams: Promise.resolve(searchParams),
})

const renderPage = async (path: string[], searchParams = {}) => {
  // ThemeBoardList 는 비동기 서버 컴포넌트 — 트리를 펼쳐 그린다
  const tree = (await ThemeBoardPage(props(path, searchParams))) as React.ReactElement<{
    children: React.ReactElement[]
  }>
  const main = tree.props.children[1] as React.ReactElement<{ children: React.ReactElement }>
  const content = main.props.children
  const element =
    typeof content.type === 'function' && content.type.name === 'ThemeBoardList'
      ? await (content.type as (p: unknown) => Promise<React.ReactElement>)(content.props)
      : content
  return render(element)
}

beforeEach(() => {
  vi.clearAllMocks()
  hostHeader.value = null
  fetchPublicSite.mockResolvedValue(siteWith([boardOf('LIST')]))
  fetchPublicPosts.mockResolvedValue(listOf([post]))
})

describe('테마형 게시판 목록 (T-141)', () => {
  it('목록형: 제목 · 설명 · 상세 링크 · 검색 주소', async () => {
    fetchPublicSite.mockResolvedValue(siteWith([boardOf('LIST', 'news', '새 소식입니다')]))
    await renderPage(['news'])
    expect(screen.getByRole('heading', { name: '병원 소식' })).toBeInTheDocument()
    expect(screen.getByText('새 소식입니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /첫 글/ })).toHaveAttribute('href', '/demo/b/news/p1')
    expect(screen.getByRole('search')).toHaveAttribute('action', '/demo/b/news')
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 10, q: undefined })
  })

  it('갤러리형: 12개씩, 첫 사진 · 사진 없는 글은 빈 칸', async () => {
    fetchPublicSite.mockResolvedValue(siteWith([boardOf('GALLERY')]))
    fetchPublicPosts.mockResolvedValue(
      listOf([{ ...post, thumbnail: 'http://x/a.webp' }, { ...post, id: 'p2', title: '글만' }]),
    )
    const { container } = await renderPage(['news'])
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 12, q: undefined })
    expect(container.querySelector('img')).toHaveAttribute('src', 'http://x/a.webp')
    expect(container.querySelector('[data-empty-thumb]')).toBeInTheDocument()
  })

  describe('게시판 디자인 (T-148)', () => {
    const design = {
      columns: 4,
      image_ratio: '1:1',
      show_date: false,
      show_image: false,
      show_summary: false,
      faq_single_open: true,
      faq_first_open: true,
    } as const
    const card = {
      ...post,
      thumbnail: 'http://x/a.webp',
      summary: '요약 글자',
      card_fields: [{ key: 'd', label: '부서', field_type: 'TEXT', value: '개발팀' }],
    }

    it('카드형: 12개씩, 사진 · 요약 · 칸 값 · 날짜', async () => {
      fetchPublicSite.mockResolvedValue(siteWith([boardOf('CARD')]))
      fetchPublicPosts.mockResolvedValue(listOf([card]))
      const { container } = await renderPage(['news'])
      expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 12, q: undefined })
      expect(container.querySelector('ul.md\\:grid-cols-3')).not.toBeNull()
      expect(container.querySelector('img')).toHaveClass('aspect-[4/3]')
      expect(screen.getByText('요약 글자')).toBeInTheDocument()
      expect(screen.getByText('부서: 개발팀')).toBeInTheDocument()
      expect(container.querySelector('main time, section time')).not.toBeNull()
    })

    it('카드형: 끈 항목은 나오지 않는다', async () => {
      fetchPublicSite.mockResolvedValue(siteWith([{ ...boardOf('CARD'), design }]))
      fetchPublicPosts.mockResolvedValue(listOf([card]))
      const { container } = await renderPage(['news'])
      expect(container.querySelector('ul.md\\:grid-cols-4')).not.toBeNull()
      expect(container.querySelector('section img')).toBeNull()
      expect(screen.queryByText('요약 글자')).toBeNull()
      expect(screen.getByText('부서: 개발팀')).toBeInTheDocument()
    })

    it('갤러리형: 줄 개수 · 비율 · 날짜', async () => {
      fetchPublicSite.mockResolvedValue(siteWith([{ ...boardOf('GALLERY'), design }]))
      fetchPublicPosts.mockResolvedValue(listOf([{ ...post, thumbnail: 'http://x/a.webp' }]))
      const { container } = await renderPage(['news'])
      expect(container.querySelector('ul.md\\:grid-cols-4')).not.toBeNull()
      expect(container.querySelector('section img')).toHaveClass('aspect-square')
      expect(container.querySelector('section ul time')).toBeNull()
    })

    it('FAQ형: 하나만 펼치기 · 첫 질문 펼침', async () => {
      fetchPublicSite.mockResolvedValue(siteWith([{ ...boardOf('FAQ'), design }]))
      fetchPublicPosts.mockResolvedValue(listOf([{ ...post, body: [] }]))
      const { container } = await renderPage(['news'])
      const item = container.querySelector('details') as HTMLDetailsElement
      expect(item).toHaveAttribute('name', 'faq-news')
      expect(item.open).toBe(true)
    })

    it('목록형: 날짜를 끌 수 있다', async () => {
      fetchPublicSite.mockResolvedValue(siteWith([{ ...boardOf('LIST'), design }]))
      fetchPublicPosts.mockResolvedValue(listOf([post]))
      const { container } = await renderPage(['news'])
      expect(container.querySelector('section ul time')).toBeNull()
    })
  })

  it('FAQ형: 20개씩, 질문 펼침 · 스크립트 글자는 글자로', async () => {
    fetchPublicSite.mockResolvedValue(siteWith([boardOf('FAQ')]))
    fetchPublicPosts.mockResolvedValue(
      listOf([{ ...post, title: '시간은?', body: [{ type: 'p', text: '<script>x</script> 9시' }] }]),
    )
    const { container } = await renderPage(['news'])
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { page: 1, size: 20, q: undefined })
    const item = container.querySelector('details') as HTMLElement
    expect(within(item).getByText('시간은?').tagName).toBe('SUMMARY')
    expect(item).toHaveTextContent('<script>x</script> 9시')
    expect(item.querySelector('script')).toBeNull()
  })

  it('글이 없으면 빈 안내, 검색이면 검색 안내', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([]))
    const { unmount } = await renderPage(['news'])
    expect(screen.getByText('등록된 글이 없습니다.')).toBeInTheDocument()
    unmount()
    await renderPage(['news'], { q: '없음' })
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument()
  })

  it('페이지 이동: 검색어 유지, 지난 페이지면 마지막 페이지로', async () => {
    fetchPublicPosts.mockResolvedValue(listOf([post], 25))
    await renderPage(['news'], { q: '소', p: '9' })
    expect(fetchPublicPosts).toHaveBeenLastCalledWith('demo', 'news', { page: 3, size: 10, q: '소' })
    expect(screen.getByRole('link', { name: '3' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '/demo/b/news?q=%EC%86%8C&p=2')
  })

  it('고객 도메인이면 링크에 slug 가 없다', async () => {
    hostHeader.value = 'www.oo.com'
    await renderPage(['news'])
    expect(screen.getByRole('link', { name: /첫 글/ })).toHaveAttribute('href', '/b/news/p1')
    expect(screen.getByRole('search')).toHaveAttribute('action', '/b/news')
  })
})

describe('테마형 게시판 상세 · 주소', () => {
  it('게시판 이름 · 본문 · 이전 글 · 목록', async () => {
    fetchPublicPost.mockResolvedValue({
      ...post,
      body: [{ type: 'p', text: '본문입니다' }],
      prev_id: 'p0',
      next_id: null,
    })
    await renderPage(['news', 'p1'])
    expect(fetchPublicPost).toHaveBeenCalledWith('demo', 'news', 'p1')
    expect(screen.getByRole('heading', { name: '첫 글' })).toBeInTheDocument()
    expect(screen.getByText('본문입니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이전 게시글' })).toHaveAttribute('href', '/demo/b/news/p0')
    expect(screen.getByRole('link', { name: '목록보기' })).toHaveAttribute('href', '/demo/b/news')
    expect(screen.queryByRole('link', { name: '다음 게시글' })).not.toBeInTheDocument()
  })

  it('칸 값을 본문 위에 — 사진 · 별점 · 스크립트는 글자로', async () => {
    fetchPublicPost.mockResolvedValue({
      ...post,
      body: [{ type: 'p', text: '본문' }],
      prev_id: null,
      next_id: null,
      fields: [
        { key: 'r', label: '별점', field_type: 'RATING', value: 5 },
        { key: 'i', label: '사진', field_type: 'IMAGE', value: 'http://x/a.webp' },
        { key: 't', label: '메모', field_type: 'TEXT', value: '<script>x</script>' },
      ],
    })
    const { container } = await renderPage(['news', 'p1'])
    const list = container.querySelector('dl') as HTMLElement
    expect(within(list).getByText('★★★★★')).toBeInTheDocument()
    expect(within(list).getByRole('img', { name: '사진' })).toHaveAttribute('src', 'http://x/a.webp')
    expect(within(list).getByText('<script>x</script>')).toBeInTheDocument()
    expect(list.querySelector('script')).toBeNull()
    expect(list.compareDocumentPosition(screen.getByText('본문')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('메타: 게시판 · 글 제목과 대표 주소', async () => {
    const list = await generateMetadata(props(['news']))
    expect(list.title).toBe('병원 소식 | 데모')
    expect(JSON.stringify(list.alternates)).toContain('/b/news')
    fetchPublicPost.mockResolvedValue({ ...post, body: [] })
    const detail = await generateMetadata(props(['news', 'p1']))
    expect(detail.title).toBe('첫 글 | 데모')
    expect(JSON.stringify(detail.alternates)).toContain('/b/news/p1')
  })

  it.each([
    ['없는 게시판', ['gone']],
    ['기본 게시판', ['notice']],
    ['더 깊은 주소', ['news', 'p1', 'x']],
  ])('%s → 404 화면 · 색인 제외', async (_name, path) => {
    expect((await generateMetadata(props(path))).robots).toEqual({ index: false, follow: false })
    await expect(ThemeBoardPage(props(path))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('없는 글 · 비공개 글 → 404', async () => {
    fetchPublicPost.mockResolvedValue(null)
    await expect(ThemeBoardPage(props(['news', 'gone']))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('없는 사업체 → 404', async () => {
    fetchPublicSite.mockResolvedValue(null)
    await expect(ThemeBoardPage(props(['news']))).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('방금 코드형으로 바꿨으면 전환 안내 + 색인 제외', async () => {
    fetchPublicSite.mockResolvedValue(siteWith([boardOf('LIST')], 'code'))
    expect(await generateMetadata(props(['news']))).toEqual({ robots: { index: false, follow: false } })
    const tree = (await ThemeBoardPage(props(['news']))) as { type: unknown }
    expect(tree.type).toBe(TemplateSwitching)
  })
})
