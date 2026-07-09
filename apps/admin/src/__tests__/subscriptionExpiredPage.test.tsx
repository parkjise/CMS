import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ logout: vi.fn() }),
}))

import { SubscriptionExpiredPage } from '@/pages/SubscriptionExpiredPage'

describe('SubscriptionExpiredPage', () => {
  it('만료 안내와 재구독 버튼을 표시', () => {
    render(<SubscriptionExpiredPage />)
    expect(screen.getByText('구독이 종료되었습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재구독하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
})
