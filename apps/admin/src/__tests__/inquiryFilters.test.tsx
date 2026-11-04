import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InquiryFilters } from '@/components/inquiries/InquiryFilters'
import { downloadInquiriesExcel } from '@/hooks/useInquiries'
import { api } from '@/lib/api'

// 접수일 기간 필터 (T-127)
describe('InquiryFilters 기간', () => {
  it('시작일을 고르면 1쪽으로 돌아가며 값을 넘긴다', () => {
    const onChange = vi.fn()
    render(<InquiryFilters value={{ page: 3, limit: 20 }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('접수 시작일'), { target: { value: '2026-11-02' } })
    expect(onChange).toHaveBeenCalledWith({ page: 1, limit: 20, from_date: '2026-11-02' })
  })

  it('종료일을 지우면 조건을 뺀다', () => {
    const onChange = vi.fn()
    render(<InquiryFilters value={{ page: 1, to_date: '2026-11-02' }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('접수 종료일'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ page: 1, to_date: undefined })
  })

  it('시작일 이전을 종료일로 고르지 못하게 범위를 준다', () => {
    render(<InquiryFilters value={{ from_date: '2026-11-02', to_date: '2026-11-05' }} onChange={vi.fn()} />)
    expect(screen.getByLabelText('접수 시작일')).toHaveAttribute('max', '2026-11-05')
    expect(screen.getByLabelText('접수 종료일')).toHaveAttribute('min', '2026-11-02')
  })

  // responseType: 'blob' 은 Node 22 에서 MSW 가 처리하지 못해 요청 값만 확인한다
  it('엑셀 내보내기에 기간을 보낸다', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: new Blob(['x']) })
    window.URL.createObjectURL = vi.fn(() => 'blob:x')
    window.URL.revokeObjectURL = vi.fn()
    await downloadInquiriesExcel({ from_date: '2026-11-01', to_date: '2026-11-02' })
    expect(get).toHaveBeenCalledWith('/v1/inquiries/export', {
      params: { from_date: '2026-11-01', to_date: '2026-11-02' },
      responseType: 'blob',
    })
    get.mockRestore()
  })
})
