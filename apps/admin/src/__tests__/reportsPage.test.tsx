import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { ReportsPage } from '@/pages/ReportsPage'
import { fixLink, periodLabel } from '@/lib/reportLinks'
import { api } from '@/lib/api'

// AI 월간 리포트 화면 (T-073-A)

const REPORT = {
  id: 'r1',
  period: '2026-09-01',
  kind: 'AUTO',
  source: 'rule',
  summary: '9월 방문자 120명, 문의 3건이에요.',
  metrics: {
    period: '2026-09-01',
    visitors: 120,
    prev_visitors: 100,
    page_views: 300,
    mobile_ratio: 0.7,
    inquiries: 3,
    prev_inquiries: 5,
  },
  strengths: [{ code: 'cta_ok', title: '문의 버튼이 있어요', detail: '바로 연락할 수 있어요.' }],
  improvements: [
    {
      code: 'hero_title_short',
      title: '메인 문구가 짧아요',
      detail: '무엇을 하는 곳인지 한 줄 더 적어 보세요.',
      section_id: 's-hero',
      section_label: '메인 배너',
    },
    { code: 'seo_description_missing', title: '검색 설명이 없어요', detail: '설명을 넣어 주세요.' },
  ],
  created_at: '2026-10-01T06:00:00Z',
}

const ok = (data: unknown) => ({ data: { success: true, data } })

const mockList = (remaining: number, reports = [REPORT]) =>
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/v1/ai/reports') {
      return ok({
        reports: reports.map((r) => ({
          id: r.id,
          period: r.period,
          kind: r.kind,
          source: r.source,
          improvement_count: r.improvements.length,
          created_at: r.created_at,
        })),
        quota: { used: 1 - Math.min(remaining, 1), limit: 1, remaining },
      })
    }
    return ok(REPORT)
  })

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  )

beforeEach(() => vi.restoreAllMocks())

describe('ReportsPage', () => {
  it('최근 리포트 · 지표 · 강점 · 손볼 점과 고치러 가기 링크', async () => {
    mockList(1)
    renderPage()
    expect(await screen.findByText('9월 방문자 120명, 문의 3건이에요.')).toBeInTheDocument()
    expect(screen.getByText('120명')).toBeInTheDocument()
    expect(screen.getByText('+20 (지난달 100)')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('문의 버튼이 있어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /이 섹션 고치러 가기/ })).toHaveAttribute(
      'href',
      '/admin/content/s-hero',
    )
    expect(screen.getByRole('link', { name: /SEO 설정으로/ })).toHaveAttribute('href', '/admin/seo')
  })

  it('리포트가 없으면 안내', async () => {
    mockList(1, [])
    renderPage()
    expect(await screen.findByText(/아직 리포트가 없어요/)).toBeInTheDocument()
  })

  it('지금 분석하기 → 새 리포트 표시', async () => {
    mockList(1, [])
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ ...REPORT, id: 'r2', kind: 'MANUAL' }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '지금 분석하기' }))
    expect(post).toHaveBeenCalledWith('/v1/ai/reports')
  })

  it('이번 달 횟수를 다 쓰면 버튼 비활성', async () => {
    mockList(0)
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '지금 분석하기' })).toBeDisabled(),
    )
    expect(screen.getByText(/이번 달 1 \/ 1회 사용/)).toBeInTheDocument()
  })

  it('만들기 실패 시 서버 메시지 토스트', async () => {
    mockList(1, [])
    vi.spyOn(api, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { success: false, error: { code: 'PLAN_LIMIT_EXCEEDED', message: '이번 달 리포트는 1번까지예요.' } } },
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '지금 분석하기' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '지금 분석하기' })).not.toBeDisabled())
  })
})

describe('reportLinks', () => {
  it('섹션 항목은 섹션 편집, 코드 항목은 관련 화면, 모르는 코드는 링크 없음', () => {
    expect(fixLink({ code: 'x', title: '', detail: '', section_id: 's1' })?.to).toBe('/admin/content/s1')
    expect(fixLink({ code: 'contact_missing', title: '', detail: '' })?.to).toBe('/admin/content')
    expect(fixLink({ code: 'unknown', title: '', detail: '' })).toBeNull()
    expect(periodLabel('2026-09-01')).toBe('2026년 9월')
  })
})
