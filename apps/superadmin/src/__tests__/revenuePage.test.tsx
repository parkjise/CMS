import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RevenueData } from '@/hooks/useRevenue'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

const useRevenue = vi.fn()
vi.mock('@/hooks/useRevenue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useRevenue')>()
  return { ...actual, useRevenue: (m: number) => useRevenue(m) }
})

import { RevenuePage } from '@/pages/RevenuePage'

const SAMPLE: RevenueData = {
  mrr_trend: [
    { month: '2026-06', mrr: 1_000_000 },
    { month: '2026-07', mrr: 2_190_000 },
  ],
  plan_distribution: [
    { plan: 'BASIC', count: 72 },
    { plan: 'STANDARD', count: 42 },
    { plan: 'PREMIUM', count: 13 },
  ],
  expiring_tenants: [
    {
      id: 't1',
      slug: 'oo',
      name: 'OO의원',
      plan_type: 'STANDARD',
      plan_expires_at: '2026-07-07T00:00:00Z',
      days_left: 3,
    },
  ],
  movement: { new: 5, churned: 1, upgraded: 3, downgraded: 2 },
}

describe('RevenuePage', () => {
  beforeEach(() => useRevenue.mockReset().mockReturnValue({
    data: SAMPLE,
    isLoading: false,
    isError: false,
  }))

  it('이동 현황 카드 + 차트 렌더', () => {
    render(<RevenuePage />)
    expect(screen.getByText('신규')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument() // new
    expect(screen.getByTestId('mrr-chart')).toBeInTheDocument()
    expect(screen.getByTestId('plan-donut')).toBeInTheDocument()
  })

  it('만료 예정 테넌트 + 갱신 알림 버튼', () => {
    render(<RevenuePage />)
    expect(screen.getByText('OO의원')).toBeInTheDocument()
    expect(screen.getByText('3일 후 만료')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '갱신 알림' })).toBeInTheDocument()
  })

  it('기간 토글 클릭 시 해당 개월로 재조회', async () => {
    const user = userEvent.setup()
    render(<RevenuePage />)
    await user.click(screen.getByRole('button', { name: '12개월' }))
    expect(useRevenue).toHaveBeenCalledWith(12)
  })
})
