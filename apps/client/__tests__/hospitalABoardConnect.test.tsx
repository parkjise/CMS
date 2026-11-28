import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicBoard, PublicSectionPost } from '@cms/types'
import { BoardConnect } from '@/templates/hospital-a/components/sub/BoardConnect'
import type { PublicSection } from '@/lib/publicSite.types'

// hospital-a '게시판 연결' (T-264) — 데이터는 테마형과 같고 화면만 템플릿 BEM

const { fetchSectionPosts } = vi.hoisted(() => ({ fetchSectionPosts: vi.fn() }))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchSectionPosts,
}))

afterEach(cleanup)
beforeEach(() => fetchSectionPosts.mockReset())

const BOARDS = [
  { id: 'b-news', slug: 'news', name: '소식', read_access: 'PUBLIC' },
  { id: 'b-members', slug: 'members', name: '회원', read_access: 'MEMBER' },
] as PublicBoard[]

const section = (values: Record<string, string>): PublicSection => ({
  id: 'sec-board',
  section_type: 'BOARD_LATEST',
  label: '게시판 연결',
  display_order: 0,
  is_active: true,
  page_key: 'about',
  settings: Object.entries(values).map(([field_key, field_value]) => ({
    field_key,
    field_value,
    value_type: 'STRING',
  })) as PublicSection['settings'],
})

const post = (over: Partial<PublicSectionPost>): PublicSectionPost => ({
  id: 'p1',
  title: '글',
  published_at: '2026-11-20T09:00:00Z',
  category_id: null,
  summary: '',
  thumbnail: null,
  body: null,
  fields: [],
  ...over,
})

const hrefFor = (key: string, id?: string) => `/demo/${key}${id ? `/${id}` : ''}`

const renderSection = async (values: Record<string, string>) => {
  const ui = await BoardConnect({
    section: section(values),
    tenantSlug: 'demo',
    editable: false,
    boards: BOARDS,
    hrefFor,
  })
  return ui ? render(ui) : null
}

describe('hospital-a BoardConnect', () => {
  it('게시판이 없거나 회원만 읽는 게시판이면 그리지 않는다', async () => {
    expect(await renderSection({ latest_board: '' })).toBeNull()
    expect(await renderSection({ latest_board: 'b-members' })).toBeNull()
    expect(fetchSectionPosts).not.toHaveBeenCalled()
  })

  it('목록은 공지 목록 스타일 — 글 링크 · 날짜 · 전체 보기', async () => {
    fetchSectionPosts.mockResolvedValue([post({ title: '진료 시간 안내' })])
    const { container } = (await renderSection({
      section_title: '소식',
      latest_board: 'b-news',
      post_count: '4',
      sort: 'oldest',
    }))!
    expect(fetchSectionPosts).toHaveBeenCalledWith('demo', 'news', {
      size: 4,
      sort: 'oldest',
      category: undefined,
      body: false,
    })
    expect(screen.getByRole('heading', { name: '소식' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /진료 시간 안내/ })).toHaveAttribute('href', '/demo/b/news/p1')
    expect(container.querySelector('.board-list__date')).toHaveTextContent('2026. 11. 20')
    expect(screen.getByRole('link', { name: /전체 보기/ })).toHaveAttribute('href', '/demo/b/news')
  })

  it('카드는 갤러리형, FAQ 는 본문을 펼친다', async () => {
    fetchSectionPosts.mockResolvedValue([
      post({
        title: '김원장',
        summary: '20년 경력',
        fields: [{ key: 'role', label: '직책', field_type: 'TEXT', value: '대표원장' }],
      }),
    ])
    const { container } = (await renderSection({ latest_board: 'b-news', display_mode: 'CARD' }))!
    expect(container.querySelector('.board-gallery__subject')).toHaveTextContent('김원장')
    expect(screen.getByText('대표원장')).toHaveClass('board-gallery__fields')
    cleanup()

    fetchSectionPosts.mockResolvedValue([
      post({
        title: '주차 되나요?',
        body: [{ type: 'paragraph', content: [{ type: 'text', text: '지하에 있어요.' }] }],
      }),
    ])
    await renderSection({ latest_board: 'b-news', display_mode: 'FAQ' })
    expect(fetchSectionPosts.mock.lastCall?.[2]).toMatchObject({ body: true })
    expect(screen.getByText('지하에 있어요.')).toBeInTheDocument()
  })

  it('연혁은 연도 칸(없으면 공개일의 해)을 앞에', async () => {
    fetchSectionPosts.mockResolvedValue([
      post({ title: '개원', fields: [{ key: 'year', label: '연도', field_type: 'NUMBER', value: 2010 }] }),
      post({ id: 'p2', title: '확장 이전' }),
    ])
    await renderSection({ latest_board: 'b-news', display_mode: 'TIMELINE' })
    expect(screen.getByText('2010')).toHaveClass('content-list__when')
    expect(screen.getByText('2026')).toHaveClass('content-list__when')
  })

  it('글이 없으면 문구가 있을 때만, 요청 실패는 그리지 않는다', async () => {
    fetchSectionPosts.mockResolvedValue([])
    expect(await renderSection({ latest_board: 'b-news' })).toBeNull()
    await renderSection({ latest_board: 'b-news', empty_text: '아직 글이 없어요' })
    expect(screen.getByText('아직 글이 없어요')).toHaveClass('content-list__empty')
    cleanup()
    fetchSectionPosts.mockResolvedValue(null)
    expect(await renderSection({ latest_board: 'b-news', empty_text: '문구' })).toBeNull()
  })
})
