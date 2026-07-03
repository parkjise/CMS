import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FeatureItem } from '@/hooks/useFeatures'

const deployMutate = vi.fn()
const createAnnouncement = vi.fn()
vi.mock('@/hooks/useFeatures', () => ({
  useDeployFeature: () => ({ mutateAsync: deployMutate, isPending: false }),
  useDeployments: () => ({ data: [] }),
  useRollbackDeployment: () => ({ mutate: vi.fn() }),
  createDeployAnnouncement: (...args: unknown[]) => createAnnouncement(...args),
}))

vi.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: {
      stats: { total_tenants: 127 },
      plan_distribution: [{ plan: 'PREMIUM', count: 13 }],
    },
  }),
}))

vi.mock('@/hooks/useTenants', () => ({
  useTenants: () => ({ data: { items: [] } }),
}))

import { DeployModal } from '@/components/features/DeployModal'

const FEATURE: FeatureItem = {
  id: 'f1',
  key: 'AI_REPORT',
  name: 'AI 리포트',
  description: null,
  category: 'AI',
  menu_path: null,
  menu_icon: null,
  menu_label: null,
  menu_position: 99,
  default_enabled: false,
  required_plan: 'PREMIUM',
  is_beta: false,
  is_active: true,
  release_note: null,
  released_at: null,
  created_at: '2026-07-01T00:00:00Z',
  enabled_tenant_count: 0,
}

describe('DeployModal (SA-04)', () => {
  beforeEach(() => {
    deployMutate.mockReset().mockResolvedValue({})
    createAnnouncement.mockReset().mockResolvedValue(undefined)
  })

  it('기본 전체 배포는 전체 테넌트 수를 미리보기', () => {
    render(<DeployModal open feature={FEATURE} onClose={() => {}} />)
    expect(screen.getByText(/영향받는 테넌트/)).toHaveTextContent('127개')
  })

  it('점진적 배포 10%는 올림 계산으로 미리보기', async () => {
    const user = userEvent.setup()
    render(<DeployModal open feature={FEATURE} onClose={() => {}} />)
    await user.click(screen.getByLabelText(/점진적 배포/))
    // ceil(127 * 10 / 100) = 13
    expect(screen.getByText(/영향받는 테넌트/)).toHaveTextContent('13개')
  })

  it('배포 실행 시 deploy + 공지 생성 호출', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DeployModal open feature={FEATURE} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: '배포 실행' }))

    await waitFor(() =>
      expect(deployMutate).toHaveBeenCalledWith(
        expect.objectContaining({ deployment_type: 'GLOBAL' }),
      ),
    )
    // 공지 배너 토글 기본 ON → 공지 생성 호출
    expect(createAnnouncement).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
