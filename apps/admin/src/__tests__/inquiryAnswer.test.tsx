import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { InquiryDetailModal } from '@/components/inquiries/InquiryDetailModal'

const BASE = 'http://localhost:8000/api'

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  tenant_id: 't1',
  inquiry_type: 'CONSULT',
  name: '홍길동',
  phone: '010-1234-5678',
  email: null,
  message: '주차가 가능한가요?',
  status: 'PENDING',
  is_read: true,
  admin_memo: null,
  subject: '주차 문의',
  is_board: true,
  is_secret: true,
  answer: null,
  answered_at: null,
  reserved_date: null,
  reserved_time: null,
  attachments: [],
  created_at: '2026-10-23T01:00:00Z',
  updated_at: '2026-10-23T01:00:00Z',
  ...overrides,
})

const renderModal = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InquiryDetailModal inquiryId="q1" onClose={vi.fn()} />
    </QueryClientProvider>,
  )

describe('문의 상세 — 상담 게시판 답변 (T-123)', () => {
  it('게시판 글은 제목·비밀글 표시와 답변 입력란을 보여주고, 저장 시 answer 를 보낸다', async () => {
    const user = userEvent.setup()
    let payload: Record<string, unknown> | null = null
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.patch(`${BASE}/v1/inquiries/q1`, async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, data: detail({ answer: payload.answer, status: 'DONE' }) })
      }),
    )
    renderModal()
    expect(await screen.findByText('주차 문의')).toBeInTheDocument()
    expect(screen.getByText(/비밀글/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/답변 \(홈페이지 상담 게시판에 표시\)/), '네, 건물 내 주차 가능합니다.')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(payload).not.toBeNull())
    expect(payload).toMatchObject({ answer: '네, 건물 내 주차 가능합니다.' })
  })

  it('일반 문의(게시판 아님)는 답변 입력란이 없고 answer 를 보내지 않는다', async () => {
    const user = userEvent.setup()
    let payload: Record<string, unknown> | null = null
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () =>
        HttpResponse.json({
          success: true,
          data: detail({ inquiry_type: 'RESERVATION', is_board: false, reserved_date: '2026-11-05', reserved_time: '10:00' }),
        }),
      ),
      http.patch(`${BASE}/v1/inquiries/q1`, async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ success: true, data: detail() })
      }),
    )
    renderModal()
    expect(await screen.findByText('2026-11-05 10:00')).toBeInTheDocument()
    expect(screen.queryByLabelText(/답변 \(홈페이지/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(payload).not.toBeNull())
    expect(payload).not.toHaveProperty('answer')
  })
})
