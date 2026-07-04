import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { TrialStatus } from '@/hooks/useTrialStatus'

const useTrialStatus = vi.fn()
vi.mock('@/hooks/useTrialStatus', () => ({
  useTrialStatus: () => useTrialStatus(),
}))

import { TrialBanner } from '@/components/layout/TrialBanner'

function renderBanner() {
  return render(
    <MemoryRouter>
      <TrialBanner />
    </MemoryRouter>,
  )
}

const trial = (over: Partial<TrialStatus>): TrialStatus => ({
  is_trial: true,
  status: 'TRIAL',
  days_left: 10,
  trial_ends_at: '2026-07-19T00:00:00Z',
  ...over,
})

describe('TrialBanner', () => {
  beforeEach(() => useTrialStatus.mockReset())

  it('체험 중이 아니면 렌더하지 않는다', () => {
    useTrialStatus.mockReturnValue({ data: null })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('체험 중이면 남은 일수를 표시', () => {
    useTrialStatus.mockReturnValue({ data: trial({ days_left: 10 }) })
    renderBanner()
    expect(screen.getByText(/D-10/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '결제 등록' })).toBeInTheDocument()
  })

  it('D-3 이하이면 긴급(빨강) 스타일', () => {
    useTrialStatus.mockReturnValue({ data: trial({ days_left: 2 }) })
    renderBanner()
    const banner = screen.getByRole('status')
    expect(banner.className).toContain('red')
  })
})
