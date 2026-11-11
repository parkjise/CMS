import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { PoliciesPage } from '@/pages/PoliciesPage'
import { useAuthStore } from '@/stores/authStore'

const { get, put, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, put } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const doc = (kind: 'terms' | 'privacy', extra = {}) => ({
  kind,
  title: kind === 'terms' ? '이용약관' : '개인정보처리방침',
  body: kind === 'terms' ? '제1조 (목적)\n기본 약관' : '기본 방침',
  is_default: true,
  updated_at: null,
  default_body: kind === 'terms' ? '제1조 (목적)\n기본 약관' : '기본 방침',
  ...extra,
})

const ok = (data: unknown) => Promise.resolve({ data: { data } })
const confirm = vi.spyOn(window, 'confirm')

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <PoliciesPage />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' }, tenantSlug: 'demo' } as never)
  get.mockImplementation(() => ok({ terms: doc('terms'), privacy: doc('privacy') }))
})

afterEach(() => confirm.mockReset())

describe('약관 · 방침 (T-200)', () => {
  it('두 문서와 기본 문안 안내 · 홈페이지 링크를 보여 준다', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '이용약관' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '개인정보처리방침' })).toBeInTheDocument()
    expect(screen.getAllByText('기본 문안 사용 중')).toHaveLength(2)
    expect(screen.getByText(/법률 확인을 받으세요/)).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /홈페이지에서 보기/ })
    expect(links[0]).toHaveAttribute('href', 'http://localhost:3000/demo/terms')
    expect(links[1]).toHaveAttribute('href', 'http://localhost:3000/demo/privacy')
  })

  it('고치면 저장할 수 있다', async () => {
    put.mockImplementation(() =>
      ok(doc('terms', { body: '우리 약관', is_default: false, updated_at: '2026-11-11T00:00:00Z' }))
    )
    renderPage()
    const box = await screen.findByLabelText('이용약관 내용')
    const [saveTerms] = screen.getAllByRole('button', { name: '저장' })
    expect(saveTerms).toBeDisabled()
    await userEvent.clear(box)
    await userEvent.type(box, '우리 약관')
    await userEvent.click(saveTerms)
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/v1/site-settings/policies/terms', { body: '우리 약관' })
    )
    expect(toast.success).toHaveBeenCalledWith('이용약관을 저장했습니다.')
  })

  it('직접 쓴 문서는 확인 뒤 기본 문안으로 되돌린다', async () => {
    get.mockImplementation(() =>
      ok({
        terms: doc('terms', {
          body: '우리 약관',
          is_default: false,
          updated_at: '2026-11-11T00:00:00Z',
        }),
        privacy: doc('privacy'),
      })
    )
    put.mockImplementation(() => ok(doc('terms')))
    renderPage()
    expect(await screen.findByText('직접 작성 · 2026.11.11 시행')).toBeInTheDocument()
    confirm.mockReturnValueOnce(false)
    await userEvent.click(screen.getByRole('button', { name: '기본 문안으로 되돌리기' }))
    expect(put).not.toHaveBeenCalled()
    confirm.mockReturnValueOnce(true)
    await userEvent.click(screen.getByRole('button', { name: '기본 문안으로 되돌리기' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/v1/site-settings/policies/terms', { body: null })
    )
  })

  it('보기 전용 계정은 저장 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' }, tenantSlug: 'demo' } as never)
    renderPage()
    await screen.findByRole('heading', { name: '이용약관' })
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })
})
