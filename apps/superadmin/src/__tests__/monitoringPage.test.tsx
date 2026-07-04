import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MonitoringData } from '@/hooks/useMonitoring'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

const useMonitoring = vi.fn()
vi.mock('@/hooks/useMonitoring', () => ({ useMonitoring: () => useMonitoring() }))

import { MonitoringPage } from '@/pages/MonitoringPage'

const SAMPLE: MonitoringData = {
  ai_cost: {
    monthly: [{ month: '2026-07', tokens: 12000, cost_usd: 0.72 }],
    total_tokens: 12000,
    estimated_cost_usd: 0.72,
  },
  kakao: { this_month_count: 4721, estimated_cost_krw: 37768 },
  queue: { pending: 3, workers: 2 },
  errors: { sentry_configured: false, items: [] },
}

describe('MonitoringPage', () => {
  beforeEach(() => useMonitoring.mockReset())

  it('요약 카드 + AI 비용 차트 렌더', () => {
    useMonitoring.mockReturnValue({ data: SAMPLE, isLoading: false, isError: false })
    render(<MonitoringPage />)
    expect(screen.getByText('4,721건')).toBeInTheDocument()
    expect(screen.getByText('대기 3')).toBeInTheDocument()
    expect(screen.getByTestId('ai-cost-chart')).toBeInTheDocument()
  })

  it('Sentry 미연동 안내', () => {
    useMonitoring.mockReturnValue({ data: SAMPLE, isLoading: false, isError: false })
    render(<MonitoringPage />)
    expect(screen.getByText(/Sentry가 아직 연동되지 않았습니다/)).toBeInTheDocument()
  })

  it('에러 상태', () => {
    useMonitoring.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<MonitoringPage />)
    expect(screen.getByText('모니터링 데이터를 불러오지 못했습니다.')).toBeInTheDocument()
  })
})
