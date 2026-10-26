'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** 방문자 회원 화면 TanStack Query 범위 (T-113) */
const MemberProviders = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

export default MemberProviders
