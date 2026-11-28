import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicContentItem } from '@cms/types'
import { ContentList } from '@/components/sections/ContentList'
import { contentOptions } from '@/lib/publicContents'
import type { PublicSection } from '@/lib/publicSite.types'
import { isThemeRenderable } from '@/lib/themeSections'

// 테마형 콘텐츠 연결 섹션 (T-258, 콘텐츠 관리 기획서 5장)

const { fetchContentItems } = vi.hoisted(() => ({ fetchContentItems: vi.fn() }))
vi.mock('@/lib/publicContents', async (original) => ({
  ...(await original<typeof import('@/lib/publicContents')>()),
  fetchContentItems,
}))

afterEach(cleanup)
beforeEach(() => fetchContentItems.mockReset())

const section = (values: Record<string, string>): PublicSection => ({
  id: 'sec-content',
  section_type: 'CONTENT_LIST',
  label: '콘텐츠',
  display_order: 0,
  is_active: true,
  page_key: 'home',
  settings: Object.entries(values).map(([field_key, field_value]) => ({
    field_key,
    field_value,
    value_type: 'STRING',
  })) as PublicSection['settings'],
})

const item = (over: Partial<PublicContentItem>): PublicContentItem => ({
  id: 'i1',
  title: '항목',
  summary: '',
  thumbnail: null,
  body: null,
  fields: [],
  published_at: '2026-11-20T00:00:00Z',
  ...over,
})

const renderSection = async (values: Record<string, string>) => {
  const ui = await ContentList({ section: section(values), tenantSlug: 'demo' })
  return ui ? render(ui) : null
}

describe('contentOptions', () => {
  it('모르는 값 · 너무 큰 개수는 기본값으로', () => {
    expect(
      contentOptions(section({ content_type: 't1', display_mode: 'GRID', sort: 'x', item_count: '99' }))
    ).toMatchObject({ typeId: 't1', mode: 'CARD', sort: 'order', count: 24 })
    expect(contentOptions(section({})).count).toBe(6)
  })

  it('테마형이 그릴 수 있는 섹션이다', () => {
    expect(isThemeRenderable(section({}))).toBe(true)
  })
})

describe('ContentList', () => {
  it('유형이 없으면 그리지 않고 요청도 하지 않는다', async () => {
    expect(await renderSection({ section_title: '팀' })).toBeNull()
    expect(fetchContentItems).not.toHaveBeenCalled()
  })

  it('조건을 그대로 보내고 카드에 칸 · 요약 · 링크를 보여 준다', async () => {
    fetchContentItems.mockResolvedValue([
      item({
        title: '김원장',
        summary: '20년 경력',
        thumbnail: 'https://cdn.example.com/a.webp',
        fields: [
          { key: 'role', label: '직책', field_type: 'TEXT', value: '대표원장' },
          { key: 'link', label: '링크', field_type: 'URL', value: 'https://example.com' },
        ],
      }),
    ])
    await renderSection({
      section_title: '의료진',
      content_type: 't-team',
      category_id: 'c1',
      tag_id: 'g1',
      item_count: '8',
      sort: 'title',
    })
    expect(fetchContentItems).toHaveBeenCalledWith('demo', 't-team', {
      limit: 8,
      sort: 'title',
      category: 'c1',
      tag: 'g1',
      body: false,
    })
    expect(screen.getByText('의료진')).toBeInTheDocument()
    expect(screen.getByText('대표원장')).toBeInTheDocument()
    expect(screen.getByText('20년 경력')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com')
  })

  it('FAQ 는 본문을 받아 펼친다', async () => {
    fetchContentItems.mockResolvedValue([
      item({
        title: '주차 되나요?',
        body: [{ type: 'paragraph', content: [{ type: 'text', text: '건물 지하에 있어요.' }] }],
      }),
    ])
    await renderSection({ content_type: 't-faq', display_mode: 'FAQ' })
    expect(fetchContentItems.mock.calls[0][2]).toMatchObject({ body: true })
    expect(screen.getByText('주차 되나요?')).toBeInTheDocument()
    expect(screen.getByText('건물 지하에 있어요.')).toBeInTheDocument()
  })

  it('연혁은 연도 · 월 칸을 앞에 둔다', async () => {
    fetchContentItems.mockResolvedValue([
      item({
        title: '개원',
        fields: [
          { key: 'year', label: '연도', field_type: 'NUMBER', value: 2010 },
          { key: 'month', label: '월', field_type: 'NUMBER', value: 3 },
        ],
      }),
    ])
    await renderSection({ content_type: 't-history', display_mode: 'TIMELINE' })
    expect(screen.getByText('2010.03')).toBeInTheDocument()
  })

  it('로고 줄은 사진을 로고로, 링크 칸이 있으면 연다', async () => {
    fetchContentItems.mockResolvedValue([
      item({
        title: '가나상사',
        thumbnail: 'https://cdn.example.com/logo.webp',
        fields: [{ key: 'link', label: '링크', field_type: 'URL', value: 'https://gana.example' }],
      }),
      item({ id: 'i2', title: '다라전자' }),
    ])
    await renderSection({ content_type: 't-partner', display_mode: 'LOGO' })
    expect(screen.getByRole('link', { name: '가나상사' })).toHaveAttribute('href', 'https://gana.example')
    expect(screen.getByText('다라전자')).toBeInTheDocument()
  })

  it('콘텐츠가 없으면 문구가 있을 때만 그린다', async () => {
    fetchContentItems.mockResolvedValue([])
    expect(await renderSection({ content_type: 't1' })).toBeNull()
    await renderSection({ content_type: 't1', empty_text: '곧 소개할게요' })
    expect(screen.getByText('곧 소개할게요')).toBeInTheDocument()
  })

  it('스위치가 꺼졌거나 유형이 없으면(null) 그리지 않는다', async () => {
    fetchContentItems.mockResolvedValue(null)
    expect(await renderSection({ content_type: 't1', empty_text: '문구' })).toBeNull()
  })
})
