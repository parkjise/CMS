import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PaymentHistoryItem } from '@/hooks/useBilling'

const usePaymentHistory = vi.fn()
vi.mock('@/hooks/useBilling', () => ({
  usePaymentHistory: () => usePaymentHistory(),
}))

import { PaymentHistoryTab } from '@/components/billing/tabs/PaymentHistoryTab'

const pay = (over: Partial<PaymentHistoryItem> & { id: string }): PaymentHistoryItem => ({
  order_id: 'SUB-001',
  amount: 89_000,
  status: 'SUCCESS',
  failure_reason: null,
  receipt_url: null,
  paid_at: '2026-07-05T00:00:00Z',
  created_at: '2026-07-05T00:00:00Z',
  ...over,
})

describe('PaymentHistoryTab', () => {
  beforeEach(() => usePaymentHistory.mockReset())

  it('결제 내역 행 렌더', () => {
    usePaymentHistory.mockReturnValue({
      data: [pay({ id: 'p1', receipt_url: 'https://receipt/1' })],
      isLoading: false,
      isError: false,
    })
    render(<PaymentHistoryTab />)
    expect(screen.getByText('SUB-001')).toBeInTheDocument()
    expect(screen.getByText('89,000원')).toBeInTheDocument()
    expect(screen.getByText('SUCCESS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '보기' })).toHaveAttribute(
      'href',
      'https://receipt/1',
    )
  })

  it('빈 내역 안내', () => {
    usePaymentHistory.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<PaymentHistoryTab />)
    expect(screen.getByText('결제 내역이 없습니다.')).toBeInTheDocument()
  })
})
