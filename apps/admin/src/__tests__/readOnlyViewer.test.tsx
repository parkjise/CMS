import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import type { User } from '@cms/types'
import { MemberReservationPanel } from '@/components/inquiries/MemberReservationPanel'
import { ReadOnlyBanner } from '@/components/layout/ReadOnlyBanner'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import type { InquiryDetail } from '@/hooks/useInquiries'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'
import { server } from './server'

// 보기 전용 계정 화면 (T-130) — 실제 쓰기 차단은 서버가 한다
const setRole = (role: User['role'] | null) =>
  useAuthStore.setState({ user: role ? ({ role } as User) : null })

const Form = () => (
  <ReadOnlyFieldset>
    <input aria-label="이름" />
    <button type="button">저장</button>
    <a href="/admin/content">섹션 보기</a>
  </ReadOnlyFieldset>
)

const withQuery = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {node}
  </QueryClientProvider>
)

const inquiry = {
  id: 'i1',
  member: null,
  reservation: {
    reservation_type: 'MEDICAL',
    status: 'PENDING',
    reserved_at: null,
    next_statuses: ['CONFIRMED', 'CANCELLED'],
  },
} as unknown as InquiryDetail

const templatesResponse = {
  success: true,
  data: {
    current_template_id: 't2',
    templates: [
      {
        id: 't1',
        template_type: 'HOSPITAL',
        name: '다른 템플릿',
        description: null,
        thumbnail_url: null,
        css_variables: {},
        section_layouts: [],
        is_active: true,
        min_plan: 'BASIC',
        locked: false,
      },
    ],
  },
}

const renderTemplates = async () => {
  server.use(
    http.get('http://localhost:8000/api/v1/templates', () => HttpResponse.json(templatesResponse)),
  )
  useFeatureStore.setState({ settled: true })
  render(withQuery(<TemplatesPage />))
  return screen.findByRole('button', { name: '적용하기' })
}

describe('보기 전용 계정', () => {
  afterEach(() => setRole(null))

  it('뷰어 — 안내가 나오고 입력칸 · 버튼이 잠기며 링크는 그대로', () => {
    setRole('TENANT_VIEWER')
    render(
      <>
        <ReadOnlyBanner />
        <Form />
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('보기 전용 계정')
    expect(screen.getByLabelText('이름')).toBeDisabled()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '섹션 보기' })).toBeInTheDocument()
  })

  it('관리자 — 안내 없음, 잠기지 않음', () => {
    setRole('TENANT_ADMIN')
    render(
      <>
        <ReadOnlyBanner />
        <Form />
      </>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText('이름')).toBeEnabled()
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  it('뷰어 — 회원 예약은 상태만 보이고 처리 버튼이 없다', () => {
    setRole('TENANT_VIEWER')
    render(withQuery(<MemberReservationPanel inquiry={inquiry} />))
    expect(screen.getByText('대기중')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('관리자 — 회원 예약 처리 버튼이 있다', () => {
    setRole('TENANT_ADMIN')
    render(withQuery(<MemberReservationPanel inquiry={inquiry} />))
    expect(screen.getByRole('button', { name: '예약 확정' })).toBeEnabled()
  })

  it('뷰어 — 템플릿은 미리보기만, 적용 · 롤백 · 색상 조정이 없다', async () => {
    setRole('TENANT_VIEWER')
    expect(await renderTemplates()).toBeDisabled()
    expect(screen.getByRole('button', { name: /미리보기/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /롤백/ })).toBeNull()
    expect(screen.queryByText('색상 · 폰트 조정')).toBeNull()
  })

  it('관리자 — 템플릿 적용 · 롤백 · 색상 조정이 있다', async () => {
    setRole('TENANT_ADMIN')
    expect(await renderTemplates()).toBeEnabled()
    expect(screen.getByRole('button', { name: /롤백/ })).toBeInTheDocument()
    expect(screen.getByText('색상 · 폰트 조정')).toBeInTheDocument()
  })
})
