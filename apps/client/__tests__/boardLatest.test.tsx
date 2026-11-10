import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicBoard, TemplateManifest } from '@cms/types'
import { BoardLatest } from '@/components/sections/BoardLatest'
import { latestBoard, latestCount } from '@/lib/latestBoard'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import type { PublicSection, PublicSite } from '@/lib/publicSite.types'
import { themeHomeSections } from '@/lib/themeSections'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import type { CodeTemplateEntry, CodeTemplateProps } from '@/templates/shared/contracts'

// 메인 화면 최신 글 (T-185) — 테마형 BOARD_LATEST · 코드형 NOTICE_LATEST 의 게시판 고르기

const { fetchPublicPosts, requestHeaders } = vi.hoisted(() => ({
  fetchPublicPosts: vi.fn(),
  requestHeaders: { value: new Headers() },
}))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPosts,
}))
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.value }))

afterEach(cleanup)
beforeEach(() => {
  fetchPublicPosts.mockReset()
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

  it('개수는 3~8, 아니면 기본값', () => {
    expect(latestCount(section({ post_count: '7' }), 5)).toBe(7)
    expect(latestCount(section({ post_count: '' }), 5)).toBe(5)
    expect(latestCount(section({ post_count: '20' }), 4)).toBe(4)
    expect(latestCount(section({}), 4)).toBe(4)
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

describe('BoardLatest (테마형)', () => {
  it('고른 게시판의 공개 글을 최신순으로, 글 · 전체 보기 링크와 함께', async () => {
    fetchPublicPosts.mockResolvedValue(
      posts([
        { id: 'p1', title: '첫 소식' },
        { id: 'p2', title: '비밀 소식', is_secret: true },
      ]),
    )
    const ui = await BoardLatest({
      section: section({ section_title: '병원 소식', latest_board: 'b-news', post_count: '3' }),
      tenantSlug: 'demo',
      boards: BOARDS,
    })
    render(ui!)
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'news', { size: 3, order: 'latest' })
    expect(screen.getByRole('heading', { name: '병원 소식' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /첫 소식/ })).toHaveAttribute('href', '/demo/b/news/p1')
    expect(screen.getByRole('link', { name: /비밀 소식/ })).toHaveTextContent('비밀글')
    expect(screen.getByRole('link', { name: /전체 보기/ })).toHaveAttribute('href', '/demo/b/news')
    expect(screen.getAllByText('2026.11.10')).toHaveLength(2)
  })

  it('공지 게시판은 /notice, 개인 도메인이면 주소 앞 상호를 뺀다', async () => {
    fetchPublicPosts.mockResolvedValue(posts([{ id: 'p1', title: '휴진 안내' }]))
    requestHeaders.value = new Headers({ [CUSTOM_HOST_HEADER]: 'clinic.example.com' })
    const ui = await BoardLatest({
      section: section({ latest_board: 'b-notice' }),
      tenantSlug: 'demo',
      boards: BOARDS,
    })
    render(ui!)
    expect(fetchPublicPosts).toHaveBeenCalledWith('demo', 'notice', { size: 5, order: 'latest' })
    expect(screen.getByRole('link', { name: /휴진 안내/ })).toHaveAttribute('href', '/notice/p1')
  })

  it('게시판을 고르지 않았거나 공개 글이 없으면 그리지 않는다', async () => {
    expect(
      await BoardLatest({ section: section({}), tenantSlug: 'demo', boards: BOARDS }),
    ).toBeNull()
    expect(fetchPublicPosts).not.toHaveBeenCalled()

    fetchPublicPosts.mockResolvedValue(posts([]))
    expect(
      await BoardLatest({
        section: section({ latest_board: 'b-news' }),
        tenantSlug: 'demo',
        boards: BOARDS,
      }),
    ).toBeNull()
    fetchPublicPosts.mockResolvedValue(null)
    expect(
      await BoardLatest({
        section: section({ latest_board: 'b-news' }),
        tenantSlug: 'demo',
        boards: BOARDS,
      }),
    ).toBeNull()
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
