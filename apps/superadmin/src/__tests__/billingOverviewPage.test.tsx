import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BillingOverview } from '@/hooks/useBillingOverview'

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
  Tooltip: () => null,
}))

const useBillingOverview = vi.fn()
const chargeMutate = vi.fn()
vi.mock('@/hooks/useBillingOverview', () => ({
  useBillingOverview: () => useBillingOverview(),
  useManualCharge: () => ({ mutateAsync: chargeMutate }),
  useRefund: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/hooks/useRevenue', () => ({
  useRevenue: () => ({
    data: {
      mrr_trend: [{ month: '2026-07', mrr: 1_000_000 }],
      plan_distribution: [{ plan: 'STANDARD', count: 3 }],
    },
  }),
}))

import { BillingOverviewPage } from '@/pages/BillingOverviewPage'

const SAMPLE: BillingOverview = {
  mrr: 21_900_000,
  past_due_count: 2,
  cancelled_count: 1,
  new_this_month: 5,
  past_due_tenants: [
    {
      subscription_id: 's1',
      tenant_id: 't1',
      name: 'OO의원',
      plan_type: 'STANDARD',
      amount: 89_000,
    },
  ],
}

describe('BillingOverviewPage (SA-06)', () => {
  beforeEach(() => {
    useBillingOverview.mockReset()
    chargeMutate.mockReset().mockResolvedValue({ status: 'SUCCESS' })
  })

  it('통계 카드 + 차트 + 연체 목록 렌더', () => {
    useBillingOverview.mockReturnValue({ data: SAMPLE, isLoading: false, isError: false })
    render(<BillingOverviewPage />)
    expect(screen.getByText('2,190만원')).toBeInTheDocument()
    expect(screen.getByTestId('mrr-chart')).toBeInTheDocument()
    expect(screen.getByTestId('plan-donut')).toBeInTheDocument()
    expect(screen.getByText('OO의원')).toBeInTheDocument()
  })

  it('수동 결제 버튼 클릭 시 charge 호출', async () => {
    const user = userEvent.setup()
    useBillingOverview.mockReturnValue({ data: SAMPLE, isLoading: false, isError: false })
    render(<BillingOverviewPage />)
    await user.click(screen.getByRole('button', { name: '수동 결제' }))
    expect(chargeMutate).toHaveBeenCalledWith('t1')
  })

  it('연체 없으면 안내', () => {
    useBillingOverview.mockReturnValue({
      data: { ...SAMPLE, past_due_tenants: [] },
      isLoading: false,
      isError: false,
    })
    render(<BillingOverviewPage />)
    expect(screen.getByText('연체 테넌트가 없습니다.')).toBeInTheDocument()
  })
})
