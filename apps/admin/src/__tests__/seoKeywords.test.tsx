import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { SeoPage } from '@/pages/SeoPage'
import { api } from '@/lib/api'

// SEO 대표 키워드 저장 · 요금제 잠금 (T-040-A)

const SEO = {
  id: 's1',
  tenant_id: 't1',
  meta_title: '강남 OO의원',
  meta_description: '설명',
  og_image_url: null,
  robots_txt: null,
  google_analytics_id: null,
  naver_site_verification: null,
  google_site_verification: null,
  keywords: ['강남 통증의학과'],
  updated_at: '2026-10-29T00:00:00Z',
}

const ok = (data: unknown) => ({ data: { success: true, data } })

const mockGet = (allowed: boolean) =>
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/v1/seo-settings/limits') {
      return ok({ keywords_allowed: allowed, keywords_max: 5, keyword_max_length: 30 })
    }
    return ok(SEO)
  })

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <SeoPage />
    </MemoryRouter>,
  )

beforeEach(() => vi.restoreAllMocks())

describe('SeoPage 대표 키워드', () => {
  it('저장된 키워드를 불러오고, 추가한 키워드를 함께 저장', async () => {
    mockGet(true)
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok({ ...SEO, keywords: ['강남 통증의학과', '허리 비수술'] }))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('강남 통증의학과')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('키워드 입력')).not.toBeDisabled())
    await user.type(screen.getByLabelText('키워드 입력'), '허리 비수술{Enter}')
    await user.click(screen.getByRole('button', { name: '기본 SEO 저장' }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][1]).toMatchObject({ keywords: ['강남 통증의학과', '허리 비수술'] })
  })

  it('BASIC 이면 잠금 안내 · 입력 막힘 · 저장 시 키워드를 보내지 않는다', async () => {
    mockGet(false)
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(SEO))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/STANDARD 이상 요금제에서 저장할 수 있어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '요금제 보기' })).toHaveAttribute('href', '/admin/billing')
    expect(screen.getByLabelText('키워드 입력')).toBeDisabled()
    // 저장돼 있던 키워드는 보이지만 지울 수 없다
    expect(screen.getByText('강남 통증의학과')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강남 통증의학과 삭제' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '기본 SEO 저장' }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][1]).not.toHaveProperty('keywords')
  })
})

// 소셜 제목 · 설명, 대표 주소, 검색 노출 (T-129)
describe('SEO 메타 칸', () => {
  const putBody = () => vi.mocked(api.put).mock.calls.at(-1)?.[1]

  beforeEach(() => {
    vi.restoreAllMocks()
    mockGet(true)
    vi.spyOn(api, 'put').mockResolvedValue(ok(SEO))
  })

  it('소셜 미리보기 탭에서 제목 · 설명을 함께 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /소셜 미리보기/ }))
    await user.type(screen.getByLabelText('소셜 공유 제목'), '공유 제목')
    await user.type(screen.getByLabelText('소셜 공유 설명'), '공유 설명')
    await user.click(screen.getByRole('button', { name: '소셜 미리보기 저장' }))
    await waitFor(() =>
      expect(putBody()).toEqual({ og_image_url: null, og_title: '공유 제목', og_description: '공유 설명' }),
    )
  })

  it('사이트맵 탭에서 검색 노출 · 대표 주소를 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /사이트맵/ }))
    await user.selectOptions(screen.getByLabelText('검색 노출'), 'noindex,nofollow')
    await user.type(screen.getByLabelText('대표 주소 (canonical)'), 'https://a.com')
    await user.click(screen.getByRole('button', { name: '사이트맵 · 검색 설정 저장' }))
    await waitFor(() =>
      expect(putBody()).toEqual({ robots: 'noindex,nofollow', canonical_url: 'https://a.com', robots_txt: null }),
    )
  })
})
