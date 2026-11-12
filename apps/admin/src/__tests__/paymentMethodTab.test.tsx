import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { toast } from '@cms/ui'
import { server } from './server'
import { PaymentMethodTab } from '@/components/billing/tabs/PaymentMethodTab'
import { useAuthStore } from '@/stores/authStore'

const BASE = 'http://localhost:8000/api'

const sub = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  tenant_id: 't1',
  plan_type: 'STANDARD',
  status: 'ACTIVE',
  billing_email: 'pay@test.com',
  billing_name: '홍길동',
  monthly_amount: 89000,
  trial_ends_at: null,
  current_period_start: '2026-11-01T00:00:00Z',
  current_period_end: '2026-12-01T00:00:00Z',
  cancelled_at: null,
  created_at: '2026-10-01T00:00:00Z',
  has_card: true,
  card_company: '신한',
  card_last4: '1234',
  ...overrides,
})

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaymentMethodTab />
    </QueryClientProvider>,
  )

const serve = (data: Record<string, unknown>) =>
  server.use(http.get(`${BASE}/v1/billing/subscription`, () => HttpResponse.json({ success: true, data })))

describe('결제 수단 — 카드 표시 · [삭제] (T-207)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it('카드사 · 끝 4자리를 보여 주고, 자동 결제 중이면 [삭제]를 잠그고 안내한다', async () => {
    serve(sub())
    renderTab()
    expect(await screen.findByText('신한카드 **** 1234')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByText(/자동 결제 중에는 카드를 삭제할 수 없어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카드 변경' })).toBeEnabled()
  })

  it('해지한 구독은 확인 후 삭제한다', async () => {
    const user = userEvent.setup()
    const success = vi.spyOn(toast, 'success')
    let deleted = false
    serve(sub({ status: 'CANCELLED', card_company: '테스트카드' }))
    server.use(
      http.delete(`${BASE}/v1/billing/card`, () => {
        deleted = true
        return HttpResponse.json({
          success: true,
          data: sub({ status: 'CANCELLED', has_card: false, card_company: null, card_last4: null }),
        })
      }),
    )
    renderTab()
    // '카드'로 끝나는 이름에는 붙이지 않는다
    expect(await screen.findByText('테스트카드 **** 1234')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(window.confirm).toHaveBeenCalledWith('테스트카드 **** 1234를 결제 수단에서 삭제할까요?')
    await waitFor(() => expect(deleted).toBe(true))
    expect(success).toHaveBeenCalledWith('결제 수단을 삭제했습니다.')
  })

  it('확인을 취소하면 삭제하지 않는다', async () => {
    const user = userEvent.setup()
    vi.mocked(window.confirm).mockReturnValue(false)
    const del = vi.fn()
    serve(sub({ status: 'TRIAL' }))
    server.use(http.delete(`${BASE}/v1/billing/card`, () => del()))
    renderTab()
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    expect(del).not.toHaveBeenCalled()
  })

  it('예전에 등록한 카드는 "등록된 카드", 카드가 없으면 [삭제] 없이 [카드 등록]', async () => {
    serve(sub({ card_company: null, card_last4: null, status: 'CANCELLED' }))
    const { unmount } = renderTab()
    expect(await screen.findByText('등록된 카드')).toBeInTheDocument()
    unmount()

    serve(sub({ has_card: false, card_company: null, card_last4: null }))
    renderTab()
    expect(await screen.findByText('등록된 결제 수단이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카드 등록' })).toBeInTheDocument()
  })

  it('서버가 막으면 안내를 보여 준다', async () => {
    const user = userEvent.setup()
    const error = vi.spyOn(toast, 'error')
    serve(sub({ status: 'SUSPENDED' }))
    server.use(
      http.delete(`${BASE}/v1/billing/card`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'CONFLICT', message: '자동 결제 중에는 카드를 삭제할 수 없습니다.' } },
          { status: 409 },
        ),
      ),
    )
    renderTab()
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('자동 결제 중에는 카드를 삭제할 수 없습니다.'))
  })
})
