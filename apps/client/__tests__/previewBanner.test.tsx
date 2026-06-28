import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreviewBanner } from '@/components/preview/PreviewBanner'

describe('PreviewBanner (T-057)', () => {
  it('미리보기 모드 안내를 표시한다', () => {
    render(<PreviewBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('미리보기 모드')
    expect(screen.getByText(/적용되지 않았습니다/)).toBeInTheDocument()
  })

  it('템플릿 이름이 주어지면 함께 표시한다', () => {
    render(<PreviewBanner templateName="모던 미니멀" />)
    expect(screen.getByRole('status')).toHaveTextContent('모던 미니멀')
  })
})
