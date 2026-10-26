import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { InquiryDetailModal } from '@/components/inquiries/InquiryDetailModal'
import { InquiryMobileCard } from '@/components/inquiries/InquiryMobileCard'
import { DashboardPage } from '@/pages/DashboardPage'

/** AD-04 회원 문의 · 회원 예약 처리, AD-01 신규 회원 카드 (T-115) */

const BASE = 'http://localhost:8000/api'

const member = {
  id: 'm1',
  name: '홍길동',
  email: 'hong@example.com',
  phone: '010-1234-5678',
  created_at: '2026-10-20T01:00:00Z',
  is_active: true,
}
const reservation = (status: string, next: string[]) => ({
  id: 'r1',
  reservation_type: 'MEDICAL',
  status,
  reserved_at: '2026-11-05T01:00:00Z',
  detail: {},
  next_statuses: next,
})
const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  tenant_id: 't1',
  inquiry_type: 'RESERVATION',
  name: '홍길동',
  phone: '010-1234-5678',
  email: null,
  message: '진료 예약 원합니다.',
  status: 'PENDING',
  is_read: true,
  admin_memo: null,
  subject: '첫 방문',
  is_board: false,
  reserved_date: '2026-11-05',
  reserved_time: '10:00',
  attachments: [],
  created_at: '2026-10-23T01:00:00Z',
  updated_at: '2026-10-23T01:00:00Z',
  member_id: 'm1',
  member,
  reservation: reservation('PENDING', ['CONFIRMED', 'CANCELLED']),
  ...overrides,
})

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderModal = () =>
  render(
    <QueryClientProvider client={client()}>
      <InquiryDetailModal inquiryId="q1" onClose={vi.fn()} />
    </QueryClientProvider>,
  )

describe('문의 상세 — 회원 정보 · 회원 예약', () => {
  it('회원 정보와 예약 상태, 다음 단계 버튼을 보여준다', async () => {
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () => HttpResponse.json({ success: true, data: detail() })),
    )
    renderModal()
    const panel = await screen.findByRole('region', { name: '회원 정보' })
    expect(panel).toHaveTextContent('홍길동 · hong@example.com · 010-1234-5678')
    expect(panel).toHaveTextContent('회원 예약 (진료)')
    expect(panel.querySelector('[data-status="PENDING"]')).toHaveTextContent('대기중')
    expect(screen.getByRole('button', { name: '예약 확정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '예약 취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument()
  })

  it('확정 → 확인 후 PATCH, 화면이 확정 상태로 바뀐다', async () => {
    const user = userEvent.setup()
    let sent: unknown = null
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () => HttpResponse.json({ success: true, data: detail() })),
      http.patch(`${BASE}/v1/inquiries/q1/reservation`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          success: true,
          data: detail({
            status: 'IN_PROGRESS',
            reservation: reservation('CONFIRMED', ['COMPLETED', 'CANCELLED']),
          }),
        })
      }),
    )
    renderModal()
    await user.click(await screen.findByRole('button', { name: '예약 확정' }))
    expect(screen.getByText(/회원에게 알림이 갈 수 있습니다/)).toBeInTheDocument()
    const confirmButtons = screen.getAllByRole('button', { name: '예약 확정' })
    await user.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(sent).toEqual({ status: 'CONFIRMED' }))
    expect(await screen.findByRole('button', { name: '완료 처리' })).toBeInTheDocument()
    // 상세 폼의 상태 선택도 서버 상태(처리중)로 바뀐다 — 그대로 저장해도 되돌아가지 않음 (E2E 발견)
    expect(screen.getByLabelText('상태 변경')).toHaveValue('IN_PROGRESS')
  })

  it('비회원 문의는 회원 영역이 없다', async () => {
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () =>
        HttpResponse.json({
          success: true,
          data: detail({ member_id: null, member: null, reservation: null }),
        }),
      ),
    )
    renderModal()
    expect(await screen.findByText('진료 예약 원합니다.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '회원 정보' })).not.toBeInTheDocument()
  })

  it('완료 · 취소된 예약은 버튼이 없다', async () => {
    server.use(
      http.get(`${BASE}/v1/inquiries/q1`, () =>
        HttpResponse.json({ success: true, data: detail({ reservation: reservation('COMPLETED', []) }) }),
      ),
    )
    renderModal()
    await screen.findByRole('region', { name: '회원 정보' })
    expect(screen.queryByRole('button', { name: /예약 확정|완료 처리|예약 취소/ })).not.toBeInTheDocument()
  })
})

describe('문의 목록 회원 배지', () => {
  it('회원 문의에만 배지', () => {
    const item = {
      id: 'q1',
      inquiry_type: 'GENERAL',
      name: '홍길동',
      phone: '010-1234-5678',
      email: null,
      status: 'PENDING' as const,
      is_read: true,
      admin_memo: null,
      created_at: '2026-10-23T01:00:00Z',
    }
    const { rerender } = render(
      <InquiryMobileCard item={{ ...item, member_id: 'm1' }} onSelect={vi.fn()} onStatusChange={vi.fn()} />,
    )
    expect(screen.getByText('회원')).toBeInTheDocument()
    rerender(<InquiryMobileCard item={{ ...item, member_id: null }} onSelect={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.queryByText('회원')).not.toBeInTheDocument()
  })
})

describe('대시보드 신규 회원 카드', () => {
  const stats = (members: unknown) =>
    http.get(`${BASE}/v1/dashboard/stats`, () =>
      HttpResponse.json({
        success: true,
        data: {
          today_page_views: 0,
          today_unique_visitors: 0,
          week_page_views: 0,
          week_unique_visitors: 0,
          new_inquiries_today: 0,
          pending_inquiries: 0,
          members,
        },
      }),
    )
  const renderPage = () =>
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

  it('회원 기능이 켜져 있으면 카드 표시', async () => {
    server.use(stats({ new_members_week: 3, total_members: 42 }))
    renderPage()
    expect(await screen.findByText('이번주 신규 회원')).toBeInTheDocument()
    expect(screen.getByText('전체 회원 42명')).toBeInTheDocument()
  })

  it('꺼져 있으면(null) 카드 없음', async () => {
    server.use(stats(null))
    renderPage()
    expect(await screen.findByText('미처리 문의')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('이번주 신규 회원')).not.toBeInTheDocument())
  })
})
