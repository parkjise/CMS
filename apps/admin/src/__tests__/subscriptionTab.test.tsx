import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Subscription } from '@/hooks/useBilling'

const useSubscription = vi.fn()
const cancelMutate = vi.fn()
vi.mock('@/hooks/useBilling', () => ({
  useSubscription: () => useSubscription(),
  useCancelSubscription: () => ({ mutateAsync: cancelMutate, isPending: false }),
}))

const emptyUsage = {
  used: 0,
  limit: null,
  remaining: null,
  exceeded: false,
  supported: true,
}
vi.mock('@/hooks/useAiUsage', () => ({
  useAiUsage: () => ({
    data: { copy_suggest: emptyUsage, chat_edit: emptyUsage },
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useInquiries', () => ({
  useInquiries: () => ({ data: { total: 0 }, isLoading: false }),
}))
vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ data: { monthly_kakao_count: 0 }, isLoading: false }),
}))

import { SubscriptionTab } from '@/components/billing/tabs/SubscriptionTab'

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

describe('SubscriptionTab', () => {
  beforeEach(() => {
    useSubscription.mockReset()
    cancelMutate.mockReset().mockResolvedValue({})
  })

  it('구독 요약과 다음 결제일 표시', () => {
    useSubscription.mockReturnValue({ data: sub({}), isLoading: false })
    render(<SubscriptionTab />)
    expect(screen.getByText(/다음 결제일/)).toBeInTheDocument()
    expect(screen.getByText('정상 구독')).toBeInTheDocument()
  })

  it('해지 버튼 클릭 시 해지 다이얼로그 오픈', async () => {
    const user = userEvent.setup()
    useSubscription.mockReturnValue({ data: sub({}), isLoading: false })
    render(<SubscriptionTab />)
    await user.click(screen.getByRole('button', { name: '구독 해지' }))
    // 다이얼로그의 해지 확인 버튼이 노출되면 오픈된 것
    expect(screen.getByRole('button', { name: '해지 확인' })).toBeInTheDocument()
  })

  it('CANCELLED 상태는 해지 버튼 없음', () => {
    useSubscription.mockReturnValue({ data: sub({ status: 'CANCELLED' }), isLoading: false })
    render(<SubscriptionTab />)
    expect(screen.queryByRole('button', { name: '구독 해지' })).not.toBeInTheDocument()
  })
})
