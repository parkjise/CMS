import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicBoard, PublicSectionPost, TemplateManifest } from '@cms/types'
import { BoardLatest } from '@/components/sections/BoardLatest'
import { connectOptions, latestBoard, latestCount } from '@/lib/latestBoard'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import type { PublicSection, PublicSite } from '@/lib/publicSite.types'
import { themeHomeSections } from '@/lib/themeSections'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import type { CodeTemplateEntry, CodeTemplateProps } from '@/templates/shared/contracts'

// 메인 화면 최신 글 (T-185) — 테마형 BOARD_LATEST · 코드형 NOTICE_LATEST 의 게시판 고르기
// 테마형은 게시판 연결 (T-243) — 목록 · 카드 · FAQ · 연혁, 분류 · 정렬 · 빈 결과 문구

const { fetchPublicPosts, fetchSectionPosts, requestHeaders } = vi.hoisted(() => ({
  fetchPublicPosts: vi.fn(),
  fetchSectionPosts: vi.fn(),
  requestHeaders: { value: new Headers() },
}))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPosts,
  fetchSectionPosts,
}))
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.value }))

afterEach(cleanup)
beforeEach(() => {
  fetchPublicPosts.mockReset()
  fetchSectionPosts.mockReset()
  requestHeaders.value = new Headers()
})

const board = (id: string, slug: string, extra: Partial<PublicBoard> = {}) =>
  ({ id, slug, name: `${slug} 게시판`, read_access: 'PUBLIC', ...extra }) as PublicBoard

const BOARDS = [
  board('b-news', 'news'),
  board('b-notice', 'notice', { name: '공지사항' }),
  board('b-members', 'members', { read_access: 'MEMBER' }),
]

const section = (
  values: Record<string, string>,
  section_type = 'BOARD_LATEST',
): PublicSection => ({
  id: 'sec-latest',
  section_type,
  label: '최신 글',
  display_order: 0,
  is_active: true,
  page_key: 'home',
  settings: Object.entries(values).map(([field_key, field_value]) => ({
    field_key,
    field_value,
    value_type: 'STRING',
  })) as PublicSection['settings'],
})

const sectionPosts = (items: Partial<PublicSectionPost>[]): PublicSectionPost[] =>
  items.map((p, i) => ({
    id: `p${i + 1}`,
    title: `글 ${i + 1}`,
    published_at: '2026-11-10T03:00:00Z',
    category_id: null,
    summary: '',
    thumbnail: null,
    body: null,
    fields: [],
    ...p,
  }))

const posts = (items: { id: string; title: string; is_secret?: boolean }[]) => ({
  total: items.length,
  page: 1,
  size: 5,
  has_posts: items.length > 0,
  items: items.map((p) => ({ is_pinned: false, published_at: '2026-11-10T03:00:00Z', ...p })),
})

describe('latestBoard · latestCount', () => {
  it('저장한 id 로 운영 중인 게시판을 찾는다 — 회원만 읽기 · 없는 게시판 · 빈 값은 null', () => {
    expect(latestBoard(section({ latest_board: 'b-news' }), BOARDS)?.slug).toBe('news')
    expect(latestBoard(section({ latest_board: 'b-members' }), BOARDS)).toBeNull()
    expect(latestBoard(section({ latest_board: 'b-gone' }), BOARDS)).toBeNull()
    expect(latestBoard(section({ latest_board: '' }), BOARDS)).toBeNull()
    expect(latestBoard(section({ latest_board: 'b-news' }), undefined)).toBeNull()
  })

  it('개수는 3~8 (게시판 연결은 12까지), 아니면 기본값', () => {
    expect(latestCount(section({ post_count: '7' }), 5)).toBe(7)
    expect(latestCount(section({ post_count: '' }), 5)).toBe(5)
    expect(latestCount(section({ post_count: '20' }), 4)).toBe(4)
    expect(latestCount(section({}), 4)).toBe(4)
    expect(latestCount(section({ post_count: '12' }), 5)).toBe(5)
    expect(latestCount(section({ post_count: '12' }), 5, 12)).toBe(12)
  })

  it('보여 주는 방식 · 정렬 · 분류 · 빈 결과 문구 — 모르는 값은 기본값', () => {
    expect(connectOptions(section({}))).toEqual({
      mode: 'LIST',
      sort: 'latest',
      category: undefined,
      emptyText: '',
    })
    expect(
      connectOptions(
        section({ display_mode: 'FAQ', sort: 'board', category_id: 'c1', empty_text: ' 없음 ' }),
      ),
    ).toEqual({ mode: 'FAQ', sort: 'board', category: 'c1', emptyText: '없음' })
    expect(connectOptions(section({ display_mode: 'SLIDER', sort: 'x' }))).toMatchObject({
      mode: 'LIST',
      sort: 'latest',
    })
  })
})

describe('themeHomeSections — 최신 글', () => {
  it('보여 줄 게시판이 없는 최신 글 섹션은 본문 · 메뉴에서 뺀다', () => {
    const chosen = section({ latest_board: 'b-news' })
    const empty = { ...section({ section_title: '최신 글' }), id: 'sec-empty' }
    expect(themeHomeSections([chosen, empty], BOARDS).map((s) => s.id)).toEqual(['sec-latest'])
    // 게시판 목록을 모르면 빼지 않는다 (섹션이 스스로 그리지 않음)
    expect(themeHomeSections([chosen, empty]).map((s) => s.id)).toEqual(['sec-latest', 'sec-empty'])
  })
})

describe('BoardLatest (테마형 게시판 연결)', () => {
  const render_ = async (values: Record<string, string>) => {
    const ui = await BoardLatest({ section: section(values), tenantSlug: 'demo', boards: BOARDS })
    if (ui) render(ui)
    return ui
  }

  it('목록 — 고른 게시판의 공개 글을 최신순으로, 글 · 전체 보기 링크와 함께', async () => {
    fetchSectionPosts.mockResolvedValue(sectionPosts([{ title: '첫 소식' }, { title: '둘째 소식' }]))
    await render_({ section_title: '병원 소식', latest_board: 'b-news', post_count: '3' })
    expect(fetchSectionPosts).toHaveBeenCalledWith('demo', 'news', {
      size: 3,
      sort: 'latest',
      category: undefined,
      body: false,
    })
    expect(screen.getByRole('heading', { name: '병원 소식' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /첫 소식/ })).toHaveAttribute('href', '/demo/b/news/p1')
    expect(screen.getByRole('link', { name: /전체 보기/ })).toHaveAttribute('href', '/demo/b/news')
    expect(screen.getAllByText('2026.11.10')).toHaveLength(2)
  })

  it('공지 게시판은 /notice, 개인 도메인이면 주소 앞 상호를 뺀다', async () => {
    fetchSectionPosts.mockResolvedValue(sectionPosts([{ title: '휴진 안내' }]))
    requestHeaders.value = new Headers({ [CUSTOM_HOST_HEADER]: 'clinic.example.com' })
    await render_({ latest_board: 'b-notice' })
    expect(fetchSectionPosts).toHaveBeenCalledWith('demo', 'notice', expect.objectContaining({ size: 5 }))
    expect(screen.getByRole('link', { name: /휴진 안내/ })).toHaveAttribute('href', '/notice/p1')
  })

  it('카드 — 사진 · 제목 · 표시 칸 · 요약, 12개까지 · 분류 · 정렬을 보낸다', async () => {
    fetchSectionPosts.mockResolvedValue(
      sectionPosts([
        {
          title: '김원장',
          summary: '20년 경력',
          thumbnail: 'http://img/a.webp',
          fields: [{ key: 'role', label: '직책', field_type: 'TEXT', value: '대표원장' }],
        },
      ]),
    )
    await render_({
      latest_board: 'b-news',
      display_mode: 'CARD',
      post_count: '12',
      sort: 'board',
      category_id: 'c-doctor',
    })
    expect(fetchSectionPosts).toHaveBeenCalledWith('demo', 'news', {
      size: 12,
      sort: 'board',
      category: 'c-doctor',
      body: false,
    })
    const card = screen.getByRole('link', { name: /김원장/ })
    expect(card).toHaveAttribute('href', '/demo/b/news/p1')
    expect(card).toHaveTextContent('대표원장')
    expect(card).toHaveTextContent('20년 경력')
    expect(card.querySelector('img')).toHaveAttribute('src', 'http://img/a.webp')
    expect(screen.queryByRole('link', { name: /전체 보기/ })).toBeNull()
  })

  it('FAQ — 본문까지 받아 질문을 펼친다', async () => {
    fetchSectionPosts.mockResolvedValue(
      sectionPosts([{ title: '주차 되나요?', body: [{ type: 'p', text: '건물 뒤에 있어요.' }] }]),
    )
    await render_({ latest_board: 'b-news', display_mode: 'FAQ' })
    expect(fetchSectionPosts).toHaveBeenCalledWith('demo', 'news', expect.objectContaining({ body: true }))
    expect(screen.getByText('주차 되나요?').closest('summary')).not.toBeNull()
    expect(screen.getByText('건물 뒤에 있어요.')).toBeInTheDocument()
  })

  it('연혁 — 연도 칸, 없으면 공개일의 해', async () => {
    fetchSectionPosts.mockResolvedValue(
      sectionPosts([
        { title: '개원', fields: [{ key: 'year', label: '연도', field_type: 'TEXT', value: '2015' }] },
        { title: '확장 이전', published_at: '2024-03-02T03:00:00Z' },
      ]),
    )
    await render_({ latest_board: 'b-news', display_mode: 'TIMELINE' })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('2015개원')
    expect(items[1]).toHaveTextContent('2024확장 이전')
  })

  it('게시판을 고르지 않았거나 · 회원 전용이거나 · 글이 없으면 그리지 않는다', async () => {
    expect(await render_({})).toBeNull()
    expect(await render_({ latest_board: 'b-members' })).toBeNull()
    expect(fetchSectionPosts).not.toHaveBeenCalled()

    fetchSectionPosts.mockResolvedValue([])
    expect(await render_({ latest_board: 'b-news' })).toBeNull()
    fetchSectionPosts.mockResolvedValue(null)
    expect(await render_({ latest_board: 'b-news', empty_text: '준비 중' })).toBeNull()
  })

  it('빈 결과 문구를 정했으면 글이 없을 때 그 문구를 보인다', async () => {
    fetchSectionPosts.mockResolvedValue([])
    await render_({ section_title: '후기', latest_board: 'b-news', empty_text: '곧 올라와요' })
    expect(screen.getByText('곧 올라와요')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /전체 보기/ })).toBeNull()
  })
})

describe('CodeTemplateRenderer — 최신 공지의 게시판', () => {
  const manifest = {
    key: 'latest-code',
    id: 'TPL_LATEST',
    name: '최신',
    renderer: 'code',
    styling: 'scss',
    version: '1.0.0',
    pages: [{ key: 'home', title: '홈', menu: 'none', default_sections: ['NOTICE_LATEST'] }],
    sections: ['NOTICE_LATEST'],
    css_variables: {},
  } as unknown as TemplateManifest

  function FakeTemplate({ latestFrom, latestNotices }: CodeTemplateProps) {
    return (
      <p>
        from:{latestFrom ? `${latestFrom.pageKey}|${latestFrom.name}` : 'notice'} posts:
        {latestNotices?.items.length ?? 'none'}
      </p>
    )
  }

  const entry: CodeTemplateEntry = {
    manifest,
    sample: { version: '1.0.0', site: {}, pages: { home: [] } },
    load: async () => ({ default: FakeTemplate }),
  }

  const site = (values: Record<string, string>): PublicSite =>
    ({
      tenant: { id: 't', slug: 'demo', name: '데모', template_type: 'HOSPITAL', plan_type: 'BASIC' },
      sections: [section(values, 'NOTICE_LATEST')],
      seo_settings: null,
      sns_settings: null,
      template: null,
      // 코드형은 공지 게시판이 목록에 없다 (공지는 템플릿 페이지)
      boards: [board('b-news', 'news', { name: '병원 소식' })],
    }) as unknown as PublicSite

  it('고른 게시판 · 개수로 글을 읽고 링크 정보를 넘긴다', async () => {
    fetchPublicPosts.mockResolvedValue(posts([{ id: 'p1', title: '소식' }]))
    render(
      await CodeTemplateRenderer({
        entry,
        site: site({ latest_board: 'b-news', post_count: '6' }),
        tenantSlug: 'demo',
        pageKey: 'home',
      }),
    )
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { size: 6, order: 'latest' })
    expect(screen.getByText(/from:b\/news\|병원 소식 posts:1/)).toBeInTheDocument()
  })

  it('고르지 않았거나 찾을 수 없으면 지금처럼 공지 4개', async () => {
    fetchPublicPosts.mockResolvedValue(posts([]))
    render(
      await CodeTemplateRenderer({
        entry,
        site: site({ latest_board: 'b-notice-id' }),
        tenantSlug: 'demo',
        pageKey: 'home',
      }),
    )
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'notice', { size: 4, order: 'latest' })
    expect(screen.getByText(/from:notice/)).toBeInTheDocument()
  })
})
