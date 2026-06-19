import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageFallback } from '@/components/layout/PageFallback'

describe('PageFallback', () => {
  it('로딩 중 상태와 aria 라벨을 노출한다', () => {
    render(<PageFallback />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-label', '페이지 로딩 중')
  })
})
