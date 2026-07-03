import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TenantFeatureItem } from '@/hooks/useTenant'

const useTenantFeatures = vi.fn()
const toggleMutate = vi.fn()
vi.mock('@/hooks/useTenant', () => ({
  useTenantFeatures: () => useTenantFeatures(),
  useToggleFeature: () => ({ mutate: toggleMutate, isPending: false }),
}))

import { FeaturesTab } from '@/components/tenants/tabs/FeaturesTab'

function feat(over: Partial<TenantFeatureItem> & { key: string }): TenantFeatureItem {
  return {
    feature_id: over.key,
    name: over.key,
    category: 'AI',
    required_plan: null,
    is_beta: false,
    is_active: true,
    is_enabled: false,
    enabled_at: null,
    ...over,
  }
}

describe('FeaturesTab (SA-03)', () => {
  beforeEach(() => {
    useTenantFeatures.mockReset()
    toggleMutate.mockReset()
  })

  it('플랜 미충족 기능은 잠금 안내 + 토글 비활성', () => {
    useTenantFeatures.mockReturnValue({
      data: [
        feat({ key: 'AI_MONTHLY_REPORT', name: 'AI 리포트', required_plan: 'PREMIUM' }),
      ],
      isLoading: false,
    })
    render(<FeaturesTab tenantId="t1" tenantPlan="BASIC" />)
    expect(screen.getByText('PREMIUM 플랜 업그레이드 필요')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'AI 리포트 토글' })).toBeDisabled()
  })

  it('충족 기능 토글 클릭 시 mutate 호출', async () => {
    const user = userEvent.setup()
    useTenantFeatures.mockReturnValue({
      data: [feat({ key: 'SECTION_EDITOR', name: '섹션 편집기', is_enabled: false })],
      isLoading: false,
    })
    render(<FeaturesTab tenantId="t1" tenantPlan="STANDARD" />)
    await user.click(screen.getByRole('checkbox', { name: '섹션 편집기 토글' }))
    expect(toggleMutate).toHaveBeenCalledWith({
      featureId: 'SECTION_EDITOR',
      enabled: true,
    })
  })

  it('BETA/미배포 뱃지 렌더', () => {
    useTenantFeatures.mockReturnValue({
      data: [
        feat({ key: 'AI_CHAT_EDIT', name: 'AI 채팅', is_beta: true }),
        feat({ key: 'NAVER_ANALYTICS', name: '네이버 분석', is_active: false }),
      ],
      isLoading: false,
    })
    render(<FeaturesTab tenantId="t1" tenantPlan="PREMIUM" />)
    expect(screen.getByText('BETA')).toBeInTheDocument()
    expect(screen.getByText('미배포')).toBeInTheDocument()
  })
})
