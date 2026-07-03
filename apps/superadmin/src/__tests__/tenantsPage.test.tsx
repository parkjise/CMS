import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { TenantListData } from '@/hooks/useTenants'

const useTenants = vi.fn()
const mutateAsync = vi.fn()
vi.mock('@/hooks/useTenants', () => ({
  useTenants: () => useTenants(),
  useCreateTenant: () => ({ mutateAsync, isPending: false }),
}))

import { TenantsPage } from '@/pages/TenantsPage'

const DATA: TenantListData = {
  items: [
    {
      id: 't1',
      slug: 'gangnam',
      name: '강남치과',
      template_type: 'GENERAL',
      plan_type: 'BASIC',
      is_active: true,
      created_at: '2026-07-01T00:00:00Z',
    },
    {
      id: 't2',
      slug: 'jeju',
      name: '제주펜션',
      template_type: 'PENSION',
      plan_type: 'STANDARD',
      is_active: false,
      created_at: '2026-06-01T00:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TenantsPage />
    </MemoryRouter>,
  )
}

describe('TenantsPage (SA-02)', () => {
  beforeEach(() => useTenants.mockReset())

  it('테넌트 목록을 렌더', () => {
    useTenants.mockReturnValue({ data: DATA, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByText('강남치과')).toBeInTheDocument()
    expect(screen.getByText('제주펜션')).toBeInTheDocument()
    expect(screen.getByText('gangnam')).toBeInTheDocument()
    // 상태 뱃지(활성/비활성)는 필터 옵션과 텍스트가 겹치므로 존재 여부만 확인
    expect(screen.getAllByText('활성').length).toBeGreaterThan(0)
  })

  it('빈 목록 안내', () => {
    useTenants.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('조건에 맞는 테넌트가 없습니다.')).toBeInTheDocument()
  })

  it('로딩/에러 상태', () => {
    useTenants.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { rerender } = renderPage()
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument()

    useTenants.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    rerender(
      <MemoryRouter>
        <TenantsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('목록을 불러오지 못했습니다.')).toBeInTheDocument()
  })

  it('첫 페이지에서 이전 버튼 비활성', () => {
    useTenants.mockReturnValue({ data: DATA, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  })
})
