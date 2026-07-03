import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { DashboardData } from '@/hooks/useDashboard'

// Recharts는 jsdom(ResizeObserver 미지원)에서 불안정 → 단순 컴포넌트로 목킹
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

const useDashboard = vi.fn()
vi.mock('@/hooks/useDashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDashboard')>()
  return { ...actual, useDashboard: () => useDashboard() }
})

import { DashboardPage } from '@/pages/DashboardPage'

const SAMPLE: DashboardData = {
  stats: {
    total_tenants: 127,
    active_tenants: 120,
    new_this_month: 3,
    mrr: 21_900_000,
    kakao_sent_this_month: 4721,
    ai_usage_this_month: 88,
  },
  plan_distribution: [
    { plan: 'BASIC', count: 72 },
    { plan: 'STANDARD', count: 42 },
    { plan: 'PREMIUM', count: 13 },
  ],
  mrr_trend: [
    { month: '2026-02', mrr: 1_000_000 },
    { month: '2026-07', mrr: 21_900_000 },
  ],
  expiring_tenants: [
    {
      id: 't1',
      slug: 'oo-clinic',
      name: 'OO의원',
      plan_type: 'STANDARD',
      plan_expires_at: '2026-07-07T00:00:00Z',
      days_left: 3,
    },
  ],
  recent_tenants: [
    {
      id: 't2',
      slug: 'gangnam',
      name: '강남치과',
      plan_type: 'BASIC',
      created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    },
  ],
  system: { server: true, db: true, redis: true, celery: false },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage (SA-01)', () => {
  beforeEach(() => useDashboard.mockReset())

  it('로딩 중에는 상태 메시지를 표시', () => {
    useDashboard.mockReturnValue({ isLoading: true, isError: false, data: undefined })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중')
  })

  it('에러 시 에러 메시지를 표시', () => {
    useDashboard.mockReturnValue({ isLoading: false, isError: true, data: undefined })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했습니다')
  })

  it('KPI 카드에 실데이터를 렌더', () => {
    useDashboard.mockReturnValue({ isLoading: false, isError: false, data: SAMPLE })
    renderPage()
    expect(screen.getByText('127개')).toBeInTheDocument()
    expect(screen.getByText('2,190만원')).toBeInTheDocument() // MRR
    expect(screen.getByText('4,721건')).toBeInTheDocument() // 알림톡
  })

  it('플랜별 현황 + 만료 예정 + 신규 테넌트 위젯 렌더', () => {
    useDashboard.mockReturnValue({ isLoading: false, isError: false, data: SAMPLE })
    renderPage()
    expect(screen.getByText('플랜별 현황')).toBeInTheDocument()
    expect(screen.getByText('OO의원')).toBeInTheDocument()
    expect(screen.getByText('3일 후 만료')).toBeInTheDocument()
    expect(screen.getByText('강남치과')).toBeInTheDocument()
    // 빠른 액션 버튼
    expect(screen.getByRole('button', { name: '접속' })).toBeInTheDocument()
  })

  it('시스템 상태를 표시 (celery down → 점검 필요)', () => {
    useDashboard.mockReturnValue({ isLoading: false, isError: false, data: SAMPLE })
    renderPage()
    expect(screen.getByText('⚠️ 점검 필요')).toBeInTheDocument()
  })
})
