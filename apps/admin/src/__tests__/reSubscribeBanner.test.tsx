import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Subscription } from '@/hooks/useBilling'

const useSubscription = vi.fn()
vi.mock('@/hooks/useBilling', () => ({
  useSubscription: () => useSubscription(),
}))

import { ReSubscribeBanner } from '@/components/billing/ReSubscribeBanner'

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  tenant_id: 't1',
  plan_type: 'STANDARD',
  status: 'ACTIVE',
  billing_email: null,
  billing_name: null,
  monthly_amount: 89_000,
  trial_ends_at: null,
  current_period_start: '2026-07-01T00:00:00Z',
  current_period_end: '2026-08-01T00:00:00Z',
  cancelled_at: null,
  created_at: '2026-07-01T00:00:00Z',
  ...over,
})

function renderBanner() {
  return render(
    <MemoryRouter>
      <ReSubscribeBanner />
    </MemoryRouter>,
  )
}

describe('ReSubscribeBanner', () => {
  beforeEach(() => useSubscription.mockReset())

  it('CANCELLED 상태에서 재구독 배너 노출', () => {
    useSubscription.mockReturnValue({ data: sub({ status: 'CANCELLED' }) })
    renderBanner()
    expect(screen.getByText(/구독이 해지되었습니다/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '재구독' })).toBeInTheDocument()
  })

  it('ACTIVE 상태에서는 렌더하지 않음', () => {
    useSubscription.mockReturnValue({ data: sub({ status: 'ACTIVE' }) })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })
})
