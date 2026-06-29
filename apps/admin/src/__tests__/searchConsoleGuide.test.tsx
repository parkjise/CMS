import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchConsoleGuideModal } from '@/components/seo/SearchConsoleGuideModal'

describe('SearchConsoleGuideModal (T-077)', () => {
  it('기본은 Google 가이드를 보여준다', () => {
    render(<SearchConsoleGuideModal open onClose={vi.fn()} />)
    expect(
      screen.getByText('검색엔진 사이트 등록 가이드'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Google 서치 콘솔에 접속/)).toBeInTheDocument()
  })

  it('탭 전환 시 네이버 가이드로 바뀐다', async () => {
    const user = userEvent.setup()
    render(<SearchConsoleGuideModal open onClose={vi.fn()} />)
    await user.click(
      screen.getByRole('tab', { name: '네이버 서치어드바이저' }),
    )
    expect(
      screen.getByText(/네이버 서치어드바이저에 접속/),
    ).toBeInTheDocument()
  })

  it('open=false면 렌더링하지 않는다', () => {
    render(<SearchConsoleGuideModal open={false} onClose={vi.fn()} />)
    expect(
      screen.queryByText('검색엔진 사이트 등록 가이드'),
    ).not.toBeInTheDocument()
  })
})
