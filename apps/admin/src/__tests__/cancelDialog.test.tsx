import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const cancelMutate = vi.fn()
vi.mock('@/hooks/useBilling', () => ({
  useCancelSubscription: () => ({ mutateAsync: cancelMutate, isPending: false }),
}))

import { CancelSubscriptionDialog } from '@/components/billing/CancelSubscriptionDialog'

describe('CancelSubscriptionDialog', () => {
  beforeEach(() => cancelMutate.mockReset().mockResolvedValue({}))

  it('해지 사유 옵션과 경고 안내를 표시', () => {
    render(<CancelSubscriptionDialog open onClose={() => {}} />)
    expect(screen.getByText('가격이 비쌈')).toBeInTheDocument()
    expect(screen.getByText('사업 종료')).toBeInTheDocument()
    expect(screen.getByText(/30일간 보관/)).toBeInTheDocument()
  })

  it('사유 선택 후 해지 확인 시 reason 전달', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CancelSubscriptionDialog open onClose={onClose} />)
    await user.click(screen.getByText('가격이 비쌈'))
    await user.click(screen.getByRole('button', { name: '해지 확인' }))
    await waitFor(() => expect(cancelMutate).toHaveBeenCalledWith('가격이 비쌈'))
    expect(onClose).toHaveBeenCalled()
  })

  it('해지 취소는 onClose 호출, 요청 안 함', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CancelSubscriptionDialog open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: '해지 취소' }))
    expect(onClose).toHaveBeenCalled()
    expect(cancelMutate).not.toHaveBeenCalled()
  })
})
