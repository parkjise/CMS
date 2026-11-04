import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { isSubscriptionBlocked, type Subscription } from '@/hooks/useBilling'
import { server } from './server'

const sub = (status: string, daysFromNow: number) =>
  ({
    status,
    current_period_end: new Date(Date.now() + daysFromNow * 86_400_000).toISOString(),
  }) as Subscription

// 구독이 멈췄을 때 재구독 화면까지 막히면 안 된다 (T-134)
describe('isSubscriptionBlocked', () => {
  it.each([
    ['SUSPENDED', 5, true],
    ['CANCELLED', -1, true],
    ['CANCELLED', 5, false],
    ['ACTIVE', -1, false],
    ['PAST_DUE', -1, false],
    ['TRIAL', 5, false],
  ])('%s, 기간 %d일 → %s', (status, days, expected) => {
    expect(isSubscriptionBlocked(sub(status, days))).toBe(expected)
  })

  it('구독 정보가 없으면 막지 않는다', () => {
    expect(isSubscriptionBlocked(null)).toBe(false)
  })
})

describe('AdminLayout — 구독 중단', () => {
  const renderAt = (path: string) => {
    server.use(
      http.get('http://localhost:8000/api/v1/billing/subscription', () =>
        HttpResponse.json({ success: true, data: sub('SUSPENDED', -5) }),
      ),
    )
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/admin/content" element={<p>콘텐츠 화면</p>} />
              <Route path="/admin/billing" element={<p>결제 화면</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('다른 화면은 만료 안내로 막는다', async () => {
    renderAt('/admin/content')
    expect(await screen.findByText('구독이 종료되었습니다')).toBeInTheDocument()
    expect(screen.queryByText('콘텐츠 화면')).toBeNull()
  })

  it('결제 화면은 열린다', async () => {
    renderAt('/admin/billing')
    expect(await screen.findAllByText('결제 화면')).not.toHaveLength(0)
    expect(screen.queryByText('구독이 종료되었습니다')).toBeNull()
  })
})
