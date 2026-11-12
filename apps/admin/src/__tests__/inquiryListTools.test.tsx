import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { InquiryStatusTabs } from '@/components/inquiries/InquiryStatusTabs'
import { InquiryTable } from '@/components/inquiries/InquiryTable'
import { InquiriesPage } from '@/pages/InquiriesPage'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))

const COUNTS = { PENDING: 3, IN_PROGRESS: 1, DONE: 5, SPAM: 2 }

describe('문의 관리 목록 도구 (T-202, AD-04)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('상태 탭 — 전체와 상태별 건수, 고르면 그 상태로', () => {
    const onChange = vi.fn()
    render(<InquiryStatusTabs counts={COUNTS} value="PENDING" onChange={onChange} />)
    const group = screen.getByRole('group', { name: '처리 상태' })
    expect(within(group).getByRole('button', { name: '전체 11건' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(within(group).getByRole('button', { name: '대기 3건' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(within(group).getByRole('button', { name: '완료 5건' }))
    expect(onChange).toHaveBeenCalledWith('DONE')
    fireEvent.click(within(group).getByRole('button', { name: '전체 11건' }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('건수를 아직 모르면 숫자 없이', () => {
    render(<InquiryStatusTabs onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
  })

  it('페이지당 개수를 바꾸면 1쪽부터', () => {
    const onFiltersChange = vi.fn()
    renderWithQuery(
      <MemoryRouter>
        <InquiryTable
          data={{ total: 120, page: 3, limit: 20, items: [] }}
          isLoading={false}
          filters={{ page: 3, limit: 20 }}
          onFiltersChange={onFiltersChange}
          onSelect={vi.fn()}
        />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText('페이지당'), { target: { value: '50' } })
    expect(onFiltersChange).toHaveBeenCalledWith({ page: 1, limit: 50 })
  })

  it('[새로고침]은 목록을 다시 읽고, 탭을 누르면 그 상태로 조회', async () => {
    get.mockResolvedValue({
      data: { data: { total: 0, page: 1, limit: 20, items: [], status_counts: COUNTS } },
    })
    renderWithQuery(
      <MemoryRouter>
        <InquiriesPage />
      </MemoryRouter>
    )
    expect(await screen.findByRole('button', { name: '대기 3건' })).toBeInTheDocument()
    const before = get.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: '새로고침' }))
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before))

    await userEvent.click(screen.getByRole('button', { name: '스팸 2건' }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/v1/inquiries', {
        params: { page: 1, limit: 20, status: 'SPAM' },
      })
    )
  })
})
