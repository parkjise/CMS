import type { ReactElement } from 'react'
import { type RenderResult, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** 폼 안에서 쿼리 · 뮤테이션 훅을 쓰는 컴포넌트용 (이미지 업로드 등) */
export const renderWithQuery = (ui: ReactElement): RenderResult =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  )
