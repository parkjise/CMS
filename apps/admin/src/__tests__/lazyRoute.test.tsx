import { describe, expect, it } from 'vitest'
import { lazy, Suspense } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { PageFallback } from '@/components/layout/PageFallback'

const LazyTestChild = lazy(() =>
  import('./fixtures/LazyTestChild').then((m) => ({
    default: m.LazyTestChild,
  })),
)

describe('lazy 라우트 패턴', () => {
  it('초기에는 PageFallback이 노출되고 이후 lazy 컴포넌트가 렌더된다', async () => {
    render(
      <Suspense fallback={<PageFallback />}>
        <LazyTestChild />
      </Suspense>,
    )

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      '페이지 로딩 중',
    )

    await waitFor(() => {
      expect(screen.getByText('lazy-loaded-content')).toBeInTheDocument()
    })
  })
})
