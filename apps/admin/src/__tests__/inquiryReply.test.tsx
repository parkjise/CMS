import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { toast } from '@cms/ui'
import { server } from './server'
import { InquiryDetailModal } from '@/components/inquiries/InquiryDetailModal'

const BASE = 'http://localhost:8000/api'

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  tenant_id: 't1',
  inquiry_type: 'GENERAL',
  name: '홍길동',
  phone: '010-1234-5678',
  email: null,
  message: '예약 가능한가요?',
  status: 'PENDING',
  is_read: true,
  admin_memo: null,
  is_board: false,
  reply_message: null,
  reply_channel: null,
  replied_at: null,
  attachments: [],
  created_at: '2026-11-12T01:00:00Z',
  updated_at: '2026-11-12T01:00:00Z',
  ...overrides,
})

const renderModal = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InquiryDetailModal inquiryId="q1" onClose={vi.fn()} />
    </QueryClientProvider>,
  )

describe('문의 상세 — 알림톡으로 답장 (T-203)', () => {
  it('[알림톡으로 답장] → 내용 입력 · 미리보기 → 보내면 테스트 모드 안내와 보낸 기록', async () => {
    const user = userEvent.setup()
    const success = vi.spyOn(toast, 'success')
    let payload: Record<string, unknown> | null = null
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.post(`${BASE}/v1/inquiries/q1/reply`, async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          success: true,
          data: {
            channel: 'KAKAO',
            test_mode: true,
            inquiry: detail({
              status: 'DONE',
              reply_message: payload.message,
              reply_channel: 'KAKAO',
              replied_at: '2026-11-12T05:30:00Z',
            }),
          },
        })
      }),
    )
    renderModal()
    await user.click(await screen.findByRole('button', { name: /알림톡으로 답장/ }))
    expect(screen.getByText('홍길동 (010-1234-5678)')).toBeInTheDocument()
    const send = screen.getByRole('button', { name: '보내기' })
    expect(send).toBeDisabled()

    await user.type(screen.getByLabelText('답장 내용'), '내일 오전 10시 가능합니다.')
    expect(screen.getByText('16 / 1,000자')).toBeInTheDocument()
    expect(screen.getByLabelText('답장 미리보기')).toHaveTextContent('내일 오전 10시 가능합니다.')

    await user.click(send)
    await waitFor(() => expect(payload).toEqual({ message: '내일 오전 10시 가능합니다.' }))
    await waitFor(() => expect(success).toHaveBeenCalledWith(expect.stringContaining('테스트 모드')))
    // 입력란은 닫히고 보낸 기록이 남는다
    expect(await screen.findByLabelText('보낸 답장')).toHaveTextContent('알림톡으로 답장함')
    expect(screen.queryByLabelText('답장 내용')).not.toBeInTheDocument()
    // 상태 선택도 완료로
    expect(screen.getByLabelText('상태 변경')).toHaveValue('DONE')
  })

  it('이미 보낸 답장은 문자 채널과 함께 보여준다', async () => {
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () =>
        HttpResponse.json({
          success: true,
          data: detail({ reply_message: '문자 답장', reply_channel: 'SMS', replied_at: '2026-11-12T05:30:00Z' }),
        }),
      ),
    )
    renderModal()
    const record = await screen.findByLabelText('보낸 답장')
    expect(record).toHaveTextContent('문자로 답장함')
    expect(record).toHaveTextContent('문자 답장')
  })

  it('요금제 한도 초과면 서버 안내를 보여주고 입력란을 유지한다', async () => {
    const user = userEvent.setup()
    const error = vi.spyOn(toast, 'error')
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.post(`${BASE}/v1/inquiries/q1/reply`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'PLAN_LIMIT_EXCEEDED', message: '이번 달 발송 한도(100건)를 초과했습니다.' },
          },
          { status: 422 },
        ),
      ),
    )
    renderModal()
    await user.click(await screen.findByRole('button', { name: /알림톡으로 답장/ }))
    await user.type(screen.getByLabelText('답장 내용'), '답변')
    await user.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('이번 달 발송 한도(100건)를 초과했습니다.'))
    expect(screen.getByLabelText('답장 내용')).toHaveValue('답변')
  })
})
