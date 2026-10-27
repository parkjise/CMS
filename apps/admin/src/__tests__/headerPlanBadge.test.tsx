import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Subscription } from '@/hooks/useBilling'
import { useAuthStore } from '@/stores/authStore'

// 관리자 상단 요금제 배지 — 실제 구독 요금제를 보여 준다 (T-082-C, 예전엔 'Free' 고정)

const useSubscription = vi.fn()
vi.mock('@/hooks/useBilling', () => ({ useSubscription: () => useSubscription() }))

import { Header } from '@/components/layout/Header'

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  tenant_id: 't1',
  plan_type: 'STANDARD',
  status: 'ACTIVE',
  billing_email: null,
  billing_name: null,
  monthly_amount: 89000,
  trial_ends_at: null,
  current_period_start: '2026-10-01T00:00:00Z',
  current_period_end: '2026-11-01T00:00:00Z',
  cancelled_at: null,
  created_at: '2026-10-01T00:00:00Z',
  ...over,
})

describe('Header 요금제 배지', () => {
  beforeEach(() => {
    useSubscription.mockReset()
    useAuthStore.setState({ tenantSlug: 'my-shop' })
  })

  it.each([
    ['FREE', 'Free'],
    ['BASIC', 'Basic'],
    ['STANDARD', 'Standard'],
    ['PREMIUM', 'Premium'],
  ])('%s → %s', (plan, label) => {
    useSubscription.mockReturnValue({ data: sub({ plan_type: plan }) })
    render(<Header />)
    expect(screen.getByLabelText(`현재 요금제 ${label}`)).toHaveTextContent(label)
  })

  it('무료 체험 중이면 함께 표시', () => {
    useSubscription.mockReturnValue({ data: sub({ plan_type: 'STANDARD', status: 'TRIAL' }) })
    render(<Header />)
    expect(screen.getByLabelText('현재 요금제 Standard 무료 체험 중')).toHaveTextContent(
      'Standard · 체험 중',
    )
  })

  it('구독 정보가 없으면(로딩 · 오류) 배지를 숨긴다', () => {
    useSubscription.mockReturnValue({ data: null })
    render(<Header />)
    expect(screen.queryByLabelText(/현재 요금제/)).toBeNull()
    expect(screen.queryByText('Free')).toBeNull()
  })
})
