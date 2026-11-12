import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { toast } from '@cms/ui'
import { server } from './server'
import { NotificationSettingsCard } from '@/components/sns/NotificationSettingsCard'
import type { NotificationSettings } from '@/hooks/useNotificationSettings'

const BASE = 'http://localhost:8000/api'

const settings = (overrides: Partial<NotificationSettings> = {}): NotificationSettings => ({
  id: 's1',
  tenant_id: 't1',
  alimtalk_enabled: true,
  sms_enabled: true,
  email_enabled: false,
  recipient_phone: null,
  recipient_phone_verified_at: null,
  recipient_email: null,
  monthly_kakao_count: 0,
  updated_at: '2026-11-12T00:00:00Z',
  ...overrides,
})

const renderCard = (s: NotificationSettings) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NotificationSettingsCard settings={s} />
    </QueryClientProvider>,
  )

describe('알림 받을 번호 [인증] (T-204)', () => {
  it('번호 입력 → [인증] → 인증번호 확인 → 저장하면 인증 id 를 함께 보낸다', async () => {
    const user = userEvent.setup()
    let saved: Record<string, unknown> | null = null
    let verifyBody: Record<string, unknown> | null = null
    server.use(
      http.post(`${BASE}/v1/notification-settings/phone/send-code`, () =>
        HttpResponse.json({
          success: true,
          data: {
            verification_id: 'v1',
            expires_at: '2026-11-12T00:03:00Z',
            resend_after_seconds: 60,
            debug_code: '123456',
          },
        }),
      ),
      http.post(`${BASE}/v1/notification-settings/phone/verify`, async ({ request }) => {
        verifyBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, data: { verification_id: 'v1', verified: true } })
      }),
      http.put(`${BASE}/v1/notification-settings`, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          success: true,
          data: settings({ recipient_phone: '010-2222-3333', recipient_phone_verified_at: '2026-11-12T00:01:00Z' }),
        })
      }),
    )
    renderCard(settings())
    expect(screen.getByRole('button', { name: '인증' })).toBeDisabled()

    await user.type(screen.getByLabelText('휴대폰 번호'), '01022223333')
    expect(screen.getByText('인증 필요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '인증' }))

    // 개발용 인증번호 안내 · 재전송 대기
    expect(await screen.findByText(/개발용 인증번호: 123456/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /재전송 \d+초/ })).toBeDisabled()
    const confirm = screen.getByRole('button', { name: '확인' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('인증번호'), '123456')
    await user.click(confirm)
    await waitFor(() => expect(verifyBody).toEqual({ verification_id: 'v1', code: '123456' }))
    expect(await screen.findByText('인증됨')).toBeInTheDocument()
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '알림 설정 저장' }))
    await waitFor(() => expect(saved).not.toBeNull())
    expect(saved).toMatchObject({ recipient_phone: '01022223333', phone_verification_id: 'v1' })
  })

  it('인증하지 않은 새 번호는 저장 요청을 보내지 않고 안내한다', async () => {
    const user = userEvent.setup()
    const error = vi.spyOn(toast, 'error')
    const put = vi.fn()
    server.use(
      http.put(`${BASE}/v1/notification-settings`, () => {
        put()
        return HttpResponse.json({ success: true, data: settings() })
      }),
    )
    renderCard(settings({ recipient_phone: '010-1111-2222', recipient_phone_verified_at: '2026-11-01T00:00:00Z' }))
    expect(screen.getByText('인증됨')).toBeInTheDocument()

    const input = screen.getByLabelText('휴대폰 번호')
    await user.clear(input)
    await user.type(input, '010-9999-8888')
    expect(screen.getByText('인증 필요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '알림 설정 저장' }))
    expect(error).toHaveBeenCalledWith('휴대폰 번호 [인증]을 먼저 완료해주세요.')
    expect(put).not.toHaveBeenCalled()
  })

  it('기존 번호(인증 전)는 그대로 저장되고 [인증] 할 수 있다', async () => {
    const user = userEvent.setup()
    let saved: Record<string, unknown> | null = null
    server.use(
      http.put(`${BASE}/v1/notification-settings`, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, data: settings({ recipient_phone: '010-1111-2222' }) })
      }),
    )
    renderCard(settings({ recipient_phone: '010-1111-2222' }))
    expect(screen.getByText('인증 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '인증' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '알림 설정 저장' }))
    await waitFor(() => expect(saved).not.toBeNull())
    expect(saved).not.toHaveProperty('phone_verification_id')
  })

  it('틀린 인증번호는 서버 안내를 보여준다', async () => {
    const user = userEvent.setup()
    const error = vi.spyOn(toast, 'error')
    server.use(
      http.post(`${BASE}/v1/notification-settings/phone/send-code`, () =>
        HttpResponse.json({
          success: true,
          data: { verification_id: 'v1', expires_at: '2026-11-12T00:03:00Z', resend_after_seconds: 60, debug_code: null },
        }),
      ),
      http.post(`${BASE}/v1/notification-settings/phone/verify`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INVALID_CODE', message: '인증번호가 일치하지 않습니다' } },
          { status: 400 },
        ),
      ),
    )
    renderCard(settings())
    await user.type(screen.getByLabelText('휴대폰 번호'), '010-2222-3333')
    await user.click(screen.getByRole('button', { name: '인증' }))
    await user.type(await screen.findByLabelText('인증번호'), '000000')
    expect(screen.queryByText(/개발용 인증번호/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('인증번호가 일치하지 않습니다'))
    expect(screen.getByText('인증 필요')).toBeInTheDocument()
  })
})
