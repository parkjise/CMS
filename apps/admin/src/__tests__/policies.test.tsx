import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { PoliciesPage } from '@/pages/PoliciesPage'
import { fromSeoulInput, seoulDateTime } from '@/lib/seoulTime'
import { useAuthStore } from '@/stores/authStore'

// 사이트 관리 → 약관 · 정책 관리 — 버전 · 예약 (T-200 · T-224, 사이트 관리 기획서 SM-03)

const { get, put, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, put, post } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

type Kind = 'terms' | 'privacy'

const version = (n: number, status: string, extra = {}) => ({
  id: `v${n}`,
  version: n,
  status,
  summary: `요약 ${n}`,
  effective_at: status === 'draft' ? null : '2026-11-01T00:00:00Z',
  published_at: null,
  archived_at: null,
  created_at: '2026-10-30T00:00:00Z',
  ...extra,
})

const doc = (kind: Kind, extra = {}) => ({
  kind,
  title: kind === 'terms' ? '이용약관' : '개인정보처리방침',
  body: kind === 'terms' ? '제1조 (목적)\n기본 약관' : '기본 방침',
  is_default: true,
  updated_at: null,
  version: null,
  effective_at: null,
  history: [],
  default_body: kind === 'terms' ? '제1조 (목적)\n기본 약관' : '기본 방침',
  working: null,
  versions: [],
  ...extra,
})

const ok = (data: unknown) => Promise.resolve({ data: { data } })
const confirm = vi.spyOn(window, 'confirm')

const renderPage = () =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter([{ path: '/admin/site/policies', element: <PoliciesPage /> }], {
        initialEntries: ['/admin/site/policies'],
      })}
    />
  )

const withDocs = (terms = {}, privacy = {}) =>
  get.mockImplementation((url: string) =>
    url.includes('/versions/')
      ? ok({ ...version(1, 'archived'), kind: 'terms', title: '이용약관', body: '옛 약관 본문' })
      : ok({ terms: doc('terms', terms), privacy: doc('privacy', privacy) })
  )

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' }, tenantSlug: 'demo' } as never)
  withDocs()
})

afterEach(() => confirm.mockReset())

describe('시간 도우미', () => {
  it('한국 시간으로 보여 주고 보낸다', () => {
    expect(seoulDateTime('2026-11-30T15:00:00Z')).toBe('2026.12.01 00:00')
    expect(seoulDateTime('2026-11-30T15:00:00Z', false)).toBe('2026.12.01')
    expect(fromSeoulInput('2026-12-01T09:00')).toBe('2026-12-01T09:00:00+09:00')
    expect(fromSeoulInput('')).toBeNull()
  })
})

describe('약관 · 정책 관리', () => {
  it('정책 목록 — 버전 · 상태 · 시행일 · 연결, 법률 확인 안내', async () => {
    withDocs(
      {
        is_default: false,
        version: 2,
        effective_at: '2026-11-01T00:00:00Z',
        working: {
          ...version(3, 'scheduled', { effective_at: '2026-12-01T00:00:00Z' }),
          body: 'x',
        },
      },
      {}
    )
    renderPage()
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('이용약관')
    expect(rows[1]).toHaveTextContent('v2')
    expect(rows[1]).toHaveTextContent('공개')
    expect(rows[1]).toHaveTextContent('예약')
    expect(rows[1]).toHaveTextContent('다음 2026.12.01')
    expect(rows[2]).toHaveTextContent('기본 문안')
    expect(rows[2]).toHaveTextContent('방문자 글쓰기')
    expect(screen.getByText(/법률 확인을 받으세요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /홈페이지에서 보기/ })).toHaveAttribute(
      'href',
      'http://localhost:3000/demo/terms'
    )
  })

  it('작업 중 버전이 없으면 공개본을 보여 주고 새 버전을 만든다', async () => {
    post.mockReturnValue(
      ok(doc('terms', { working: { ...version(1, 'draft'), body: '제1조 (목적)\n기본 약관' } }))
    )
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/기본 문안을 보여 주는 중이에요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '새 버전 만들기' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/site-settings/policies/terms/draft'))
    expect(await screen.findByLabelText('본문')).toHaveValue('제1조 (목적)\n기본 약관')
  })

  it('초안 — 저장 막대로 저장하고, 저장한 뒤 바로 공개한다', async () => {
    const draft = { ...version(2, 'draft', { summary: null }), body: '초안 본문' }
    withDocs({ working: draft })
    put.mockImplementation((_url: string, body: { body: string; summary: string }) =>
      ok(doc('terms', { working: { ...draft, body: body.body, summary: body.summary } }))
    )
    post.mockReturnValue(ok(doc('terms', { version: 2, working: null })))
    confirm.mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    const body = await screen.findByLabelText('본문')
    const publish = screen.getByRole('button', { name: '바로 공개' })
    // 요약이 없으면 공개할 수 없다
    expect(publish).toBeDisabled()
    await user.type(body, ' 추가')
    await user.type(screen.getByLabelText('변경 내용 요약'), '조항 추가')
    // 저장 전에는 공개할 수 없다
    expect(publish).toBeDisabled()
    expect(screen.getByText('바꾼 내용을 먼저 저장해 주세요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/v1/site-settings/policies/terms/draft', {
        body: '초안 본문 추가',
        summary: '조항 추가',
      })
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '바로 공개' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '바로 공개' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('지금 공개할까요'))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/site-settings/policies/terms/publish', {
        effective_at: null,
      })
    )
  })

  it('시행일을 고르면 한국 시간으로 예약한다', async () => {
    withDocs({ working: { ...version(2, 'draft'), body: '초안' } })
    post.mockReturnValue(
      ok(doc('terms', { working: { ...version(2, 'scheduled'), body: '초안' } }))
    )
    confirm.mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('시행일 (한국 시간, 선택)')
    await user.type(input, '2099-01-02T09:30')
    await user.click(screen.getByRole('button', { name: '시행일 예약' }))
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('2099.01.02 09:30에 시행하도록 예약')
    )
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/site-settings/policies/terms/publish', {
        effective_at: '2099-01-02T09:30:00+09:00',
      })
    )
  })

  it('예약된 버전은 고칠 수 없고 예약을 취소할 수 있다', async () => {
    withDocs({
      working: {
        ...version(3, 'scheduled', { effective_at: '2026-11-30T15:00:00Z' }),
        body: '예약 본문',
      },
    })
    post.mockReturnValue(
      ok(doc('terms', { working: { ...version(3, 'draft'), body: '예약 본문' } }))
    )
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('status')).toHaveTextContent('2026.12.01 00:00에 시행돼요')
    expect(screen.queryByLabelText('본문')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '예약 취소' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/site-settings/policies/terms/cancel-schedule')
    )
    expect(await screen.findByLabelText('본문')).toHaveValue('예약 본문')
  })

  it('버전 이력에서 옛 버전 본문을 본다', async () => {
    withDocs({ version: 2, versions: [version(2, 'published'), version(1, 'archived')] })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: /버전 이력/ }))
    const list = screen.getByRole('list', { name: '이용약관 버전 이력' })
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('v1보관요약 1')
    await user.click(within(list).getAllByRole('button', { name: '보기' })[1])
    expect(await screen.findByText('옛 약관 본문')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/v1/site-settings/policies/terms/versions/1')
  })

  it('목록에서 다른 문서를 고른다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '개인정보처리방침' }))
    expect(
      screen.getByRole('heading', { name: '선택 문서 편집 — 개인정보처리방침' })
    ).toBeInTheDocument()
  })

  it('보기 전용 계정은 새 버전을 만들 수 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' }, tenantSlug: 'demo' } as never)
    renderPage()
    expect(await screen.findByText(/기본 문안을 보여 주는 중이에요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 버전 만들기' })).not.toBeInTheDocument()
  })
})
