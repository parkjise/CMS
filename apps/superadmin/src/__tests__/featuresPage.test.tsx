import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FeatureItem } from '@/hooks/useFeatures'

const useFeatures = vi.fn()
vi.mock('@/hooks/useFeatures', () => ({
  useFeatures: () => useFeatures(),
  useCreateFeature: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateFeature: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeployFeature: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeployments: () => ({ data: [] }),
  useRollbackDeployment: () => ({ mutate: vi.fn() }),
  createDeployAnnouncement: vi.fn(),
}))

vi.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: { stats: { total_tenants: 127 }, plan_distribution: [] },
  }),
}))

import { FeaturesPage } from '@/pages/FeaturesPage'

function feat(over: Partial<FeatureItem> & { id: string; name: string }): FeatureItem {
  return {
    key: over.id,
    description: null,
    category: 'AI',
    menu_path: null,
    menu_icon: null,
    menu_label: null,
    menu_position: 99,
    default_enabled: false,
    required_plan: null,
    is_beta: false,
    is_active: true,
    release_note: null,
    released_at: null,
    created_at: '2026-07-01T00:00:00Z',
    enabled_tenant_count: 0,
    ...over,
  }
}

describe('FeaturesPage (SA-04)', () => {
  beforeEach(() => useFeatures.mockReset())

  it('기능 카드 목록을 렌더 (활성 수/전체)', () => {
    useFeatures.mockReturnValue({
      data: [
        feat({
          id: 'f1',
          name: 'AI 월간 리포트',
          required_plan: 'PREMIUM',
          enabled_tenant_count: 13,
        }),
      ],
      isLoading: false,
      isError: false,
    })
    render(<FeaturesPage />)
    expect(screen.getByText('AI 월간 리포트')).toBeInTheDocument()
    expect(screen.getByText(/활성 테넌트: 13개 \/ 127개/)).toBeInTheDocument()
    expect(screen.getByText(/PREMIUM 이상/)).toBeInTheDocument()
  })

  it('BETA 뱃지 렌더', () => {
    useFeatures.mockReturnValue({
      data: [feat({ id: 'f2', name: 'AI 채팅', is_beta: true })],
      isLoading: false,
      isError: false,
    })
    render(<FeaturesPage />)
    expect(screen.getByText('BETA')).toBeInTheDocument()
  })

  it('빈 목록 안내', () => {
    useFeatures.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<FeaturesPage />)
    expect(screen.getByText('등록된 기능이 없습니다.')).toBeInTheDocument()
  })
})
