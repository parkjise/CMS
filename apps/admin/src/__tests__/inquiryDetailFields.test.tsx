import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { InquiryDetailModal } from '@/components/inquiries/InquiryDetailModal'
import { TYPE_LABELS } from '@/components/inquiries/StatusBadge'

/** 문의 상세 — 업종별 추가 정보 (T-051-A) */

const BASE = 'http://localhost:8000/api'

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  tenant_id: 't1',
  inquiry_type: 'SYMPTOM',
  name: '홍길동',
  phone: '010-1234-5678',
  email: null,
  message: '며칠째 열이 납니다.',
  status: 'PENDING',
  is_read: true,
  admin_memo: null,
  attachments: [],
  created_at: '2026-10-27T01:00:00Z',
  updated_at: '2026-10-27T01:00:00Z',
  ...overrides,
})

const renderModal = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InquiryDetailModal inquiryId="q1" onClose={vi.fn()} />
    </QueryClientProvider>,
  )

const serve = (data: ReturnType<typeof detail>) =>
  server.use(http.get(`${BASE}/v1/inquiries/q1`, () => HttpResponse.json({ success: true, data })))

describe('문의 상세 — 업종별 추가 정보', () => {
  it('detail_items 를 이름 · 값으로 보여 준다', async () => {
    serve(
      detail({
        detail: { department: 'INTERNAL', symptoms: ['FEVER', 'COLD'] },
        detail_items: [
          { label: '진료과', value: '내과' },
          { label: '증상', value: '발열, 기침 · 감기' },
        ],
      }),
    )
    renderModal()
    const box = await screen.findByRole('region', { name: '추가 정보' })
    expect(within(box).getByText('진료과')).toBeInTheDocument()
    expect(within(box).getByText('내과')).toBeInTheDocument()
    expect(within(box).getByText('발열, 기침 · 감기')).toBeInTheDocument()
  })

  it('추가 정보가 없으면 영역을 숨긴다', async () => {
    serve(detail({ detail: {}, detail_items: [] }))
    renderModal()
    expect(await screen.findByText('며칠째 열이 납니다.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '추가 정보' })).not.toBeInTheDocument()
  })

  it('증상 문의 유형 이름이 있다', () => {
    expect(TYPE_LABELS.SYMPTOM).toBe('증상')
  })
})
