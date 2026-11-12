import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { TenantListData } from '@/hooks/useTenants'

const useTenants = vi.fn()
const mutateAsync = vi.fn()
vi.mock('@/hooks/useTenants', () => ({
  useTenants: (filters: unknown) => useTenants(filters),
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
    </MemoryRouter>
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

  it('데이터를 파기한 사업체는 파기일을 보여 준다 (T-198)', () => {
    useTenants.mockReturnValue({
      data: {
        ...DATA,
        items: [
          {
            ...DATA.items[1],
            slug: 'deleted-abc',
            data_purged_at: '2026-11-11T00:00:00Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText(/데이터 파기됨/)).toBeInTheDocument()
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
      </MemoryRouter>
    )
    expect(screen.getByText('목록을 불러오지 못했습니다.')).toBeInTheDocument()
  })

  it('첫 페이지에서 이전 버튼 비활성', () => {
    useTenants.mockReturnValue({ data: DATA, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  })

  it('업종 · 만료일 · 30일 방문자 · 문의 수 칸 (T-205)', () => {
    useTenants.mockReturnValue({
      data: {
        ...DATA,
        items: [
          {
            ...DATA.items[0],
            template_type: 'HOSPITAL',
            expires_at: '2026-12-01T00:00:00Z',
            visitors_30d: 1234,
            inquiries_30d: 7,
          },
          { ...DATA.items[1], expires_at: null },
        ],
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    const [, first, second] = screen.getAllByRole('row')
    const cells = within(first)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(cells).toContain('병원')
    expect(cells).toContain(new Date('2026-12-01T00:00:00Z').toLocaleDateString('ko-KR'))
    expect(cells).toContain('1,234')
    expect(cells).toContain('7')
    // 구독 없는 사업체는 '-', 계산 값이 없으면 0
    const other = within(second)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(other).toContain('펜션')
    expect(other).toContain('-')
    expect(other.filter((t) => t === '0')).toHaveLength(2)
  })

  it('업종 필터 · 정렬을 바꾸면 그 조건으로 1쪽부터 다시 조회 (T-205)', async () => {
    const user = userEvent.setup()
    useTenants.mockReturnValue({ data: DATA, isLoading: false, isError: false })
    renderPage()
    expect(useTenants).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'created_desc', page: 1 })
    )
    await user.selectOptions(screen.getByLabelText('업종'), 'PENSION')
    await user.selectOptions(screen.getByLabelText('정렬'), 'expires_asc')
    expect(useTenants).toHaveBeenLastCalledWith(
      expect.objectContaining({ template_type: 'PENSION', sort: 'expires_asc', page: 1 })
    )
    expect(screen.getByRole('option', { name: '만료 임박순' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '문의 많은순' })).toBeInTheDocument()
  })
})
