import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicContentItem, User } from '@cms/types'
import { ContentList } from '@/templates/hospital-a/components/sub/ContentList'
import { useClientAuthStore } from '@/lib/authStore'
import type { PublicSection } from '@/lib/publicSite.types'

// hospital-a '콘텐츠 연결' (T-263) — 데이터는 테마형과 같고 화면만 템플릿 BEM

const { fetchContentItems } = vi.hoisted(() => ({ fetchContentItems: vi.fn() }))
vi.mock('@/lib/publicContents', async (original) => ({
  ...(await original<typeof import('@/lib/publicContents')>()),
  fetchContentItems,
}))

afterEach(() => {
  cleanup()
  useClientAuthStore.setState({ user: null, isLoggedIn: false, siteTenantId: null })
})
beforeEach(() => fetchContentItems.mockReset())

const section = (values: Record<string, string>): PublicSection => ({
  id: 'sec-content',
  section_type: 'CONTENT_LIST',
  label: '콘텐츠',
  display_order: 0,
  is_active: true,
  page_key: 'about',
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

const renderSection = async (values: Record<string, string>, draftToken?: string) => {
  const ui = await ContentList({
    section: section(values),
    tenantSlug: 'demo',
    editable: false,
    draftToken,
  })
  return ui ? render(ui) : null
}

describe('hospital-a ContentList', () => {
  it('유형이 없으면 그리지 않는다', async () => {
    expect(await renderSection({ section_title: '의료진' })).toBeNull()
    expect(fetchContentItems).not.toHaveBeenCalled()
  })

  it('카드는 게시판 갤러리형 스타일로 — 제목 · 칸 · 요약 · 링크', async () => {
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
    const { container } = (await renderSection({
      section_title: '의료진',
      content_type: 't-team',
      item_count: '6',
    }))!
    expect(screen.getByRole('heading', { name: '의료진' })).toBeInTheDocument()
    expect(container.querySelector('.content-list--card .board-gallery')).not.toBeNull()
    expect(screen.getByText('대표원장')).toHaveClass('board-gallery__fields')
    expect(screen.getByText('20년 경력')).toHaveClass('content-list__summary')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com')
    expect(fetchContentItems).toHaveBeenCalledWith('demo', 't-team', {
      limit: 6,
      sort: 'order',
      category: '',
      tag: '',
      body: false,
    })
  })

  it('FAQ 는 본문을 받아 board-faq 로 펼친다', async () => {
    fetchContentItems.mockResolvedValue([
      item({
        title: '주차 되나요?',
        body: [{ type: 'paragraph', content: [{ type: 'text', text: '건물 지하에 있어요.' }] }],
      }),
    ])
    const { container } = (await renderSection({ content_type: 't-faq', display_mode: 'FAQ' }))!
    expect(fetchContentItems.mock.calls[0][2]).toMatchObject({ body: true })
    expect(container.querySelector('.board-faq__item')).not.toBeNull()
    expect(screen.getByText('건물 지하에 있어요.')).toBeInTheDocument()
  })

  it('연혁은 연도.월 을 앞에, 로고 줄은 사진을 로고로 링크', async () => {
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
    expect(screen.getByText('2010.03')).toHaveClass('content-list__when')
    cleanup()

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
    expect(screen.getByText('다라전자')).toHaveClass('content-list__logo-name')
  })

  it('목록은 웹진형 스타일, 콘텐츠가 없으면 문구가 있을 때만', async () => {
    fetchContentItems.mockResolvedValue([item({ title: '서비스 A', summary: '요약' })])
    const { container } = (await renderSection({ content_type: 't1', display_mode: 'LIST' }))!
    expect(container.querySelector('.board-webzine__subject')).toHaveTextContent('서비스 A')
    cleanup()

    fetchContentItems.mockResolvedValue([])
    expect(await renderSection({ content_type: 't1' })).toBeNull()
    await renderSection({ content_type: 't1', empty_text: '곧 소개할게요' })
    expect(screen.getByText('곧 소개할게요')).toHaveClass('content-list__empty')
  })

  it('미리보기 토큰을 보내고 초안에 표시를 붙인다 (T-261)', async () => {
    fetchContentItems.mockResolvedValue([item({ title: '초안 항목', is_draft: true, published_at: null })])
    await renderSection({ content_type: 't1' }, 'tok')
    expect(fetchContentItems.mock.calls[0][2]).toMatchObject({ draft: 'tok' })
    expect(screen.getByText('초안')).toHaveClass('content-list__draft')
  })

  it('스위치 꺼짐은 관리자에게만 안내, 요청 실패는 그리지 않는다', async () => {
    fetchContentItems.mockResolvedValue('ERROR')
    expect(await renderSection({ content_type: 't1' })).toBeNull()

    const admin: User = {
      id: 'u1',
      tenant_id: 'tenant-1',
      email: 'a@example.com',
      role: 'TENANT_ADMIN',
      last_login_at: null,
      is_active: true,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }
    useClientAuthStore.setState({ isLoggedIn: true, user: admin })
    fetchContentItems.mockResolvedValue('FEATURE_OFF')
    await renderSection({ content_type: 't1' })
    expect(screen.getByRole('note')).toHaveTextContent('콘텐츠 관리 기능이 꺼져 있어')
  })
})
