import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SitePaused } from '@/components/layout/SitePaused'

describe('닫힌 홈페이지 안내 (T-201)', () => {
  it('사업체 이름과 안내, 전화가 있으면 전화 버튼', () => {
    render(<SitePaused site={{ status: 'PAUSED', name: '서울치과', phone: '02-1234-5678' }} />)
    expect(screen.getByText('서울치과')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '홈페이지를 잠시 쉬고 있어요' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '전화 02-1234-5678' })).toHaveAttribute(
      'href',
      'tel:0212345678'
    )
  })

  it('전화가 없으면 버튼도 없다', () => {
    render(<SitePaused site={{ status: 'PAUSED', name: '서울치과', phone: null }} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
