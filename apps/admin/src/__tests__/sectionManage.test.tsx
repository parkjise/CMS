import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { ContentPage } from '@/pages/ContentPage'
import type { Section, SectionLimits } from '@/hooks/useSections'

// AD-02 섹션 추가 · 삭제 + 요금제 한도 (T-037-A) — 실제 훅 · API 호출을 MSW 로 확인

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError } }
})

const BASE = 'http://localhost:8000/api'

const section = (id: string, label: string, order: number): Section => ({
  id,
  tenant_id: 't-1',
  section_type: 'INTRO',
  label,
  display_order: order,
  is_active: true,
  page_key: 'home',
  settings: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const TYPES = [
  { section_type: 'HERO_BANNER', label: '메인 배너' },
  { section_type: 'GALLERY', label: '갤러리' },
]

const limits = (over: Partial<SectionLimits> = {}): SectionLimits => ({
  plan_type: 'STANDARD',
  count: 2,
  limit: 10,
  can_add: true,
  can_delete: true,
  reason: null,
  addable_types: TYPES,
  ...over,
})

let sections: Section[]
let currentLimits: SectionLimits
let created: unknown
let deletedId: string | null

beforeEach(() => {
  toastSuccess.mockReset()
  toastError.mockReset()
  sections = [section('s-1', '소개', 0), section('s-2', '두 번째 소개', 1)]
  currentLimits = limits()
  created = null
  deletedId = null
  server.use(
    http.get(`${BASE}/v1/sections`, () => HttpResponse.json({ success: true, data: sections })),
    http.get(`${BASE}/v1/sections/limits`, () =>
      HttpResponse.json({ success: true, data: currentLimits }),
    ),
    http.post(`${BASE}/v1/sections`, async ({ request }) => {
      created = await request.json()
      const body = created as { section_type: string; label?: string }
      const added = { ...section('s-new', body.label ?? '갤러리', 2), section_type: body.section_type }
      sections = [...sections, added]
      currentLimits = limits({ count: 3 })
      return HttpResponse.json({ success: true, data: added }, { status: 201 })
    }),
    http.delete(`${BASE}/v1/sections/:id`, ({ params }) => {
      deletedId = params.id as string
      sections = sections.filter((s) => s.id !== params.id)
      return HttpResponse.json({ success: true, data: null })
    }),
  )
})

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('섹션 추가', () => {
  it('사용량을 보여 주고, 종류 · 이름을 골라 추가하면 목록에 나타난다', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('섹션 2 / 10개')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '섹션 추가' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByLabelText('갤러리'))
    await user.type(within(dialog).getByLabelText('섹션 이름 (선택)'), '시설 사진')
    expect(within(dialog).getByText(/8개 더 추가할 수 있어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '추가' }))

    await waitFor(() => expect(created).toEqual({ section_type: 'GALLERY', label: '시설 사진' }))
    expect(await screen.findByText('시설 사진')).toBeInTheDocument()
    expect(await screen.findByText('섹션 3 / 10개')).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('요금제 고정이면 추가 버튼이 잠기고 이유 · 삭제 버튼 없음', async () => {
    currentLimits = limits({
      plan_type: 'BASIC',
      limit: 5,
      can_add: false,
      can_delete: false,
      reason: '현재 요금제에서는 섹션 구성이 고정되어 있습니다. STANDARD 이상에서 …',
      addable_types: [],
    })
    renderPage()
    expect(await screen.findByRole('note')).toHaveTextContent('STANDARD 이상')
    expect(screen.getByRole('button', { name: '섹션 추가' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /삭제$/ })).toBeNull()
  })

  it('PREMIUM 무제한은 개수만 표시', async () => {
    currentLimits = limits({ plan_type: 'PREMIUM', limit: null })
    renderPage()
    expect(await screen.findByText('섹션 2개 사용 중')).toBeInTheDocument()
  })

  it('서버가 한도 초과(422)로 거절하면 그 안내를 보여 준다', async () => {
    server.use(
      http.post(`${BASE}/v1/sections`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'PLAN_LIMIT_EXCEEDED', message: '현재 요금제는 섹션을 10개까지 쓸 수 있습니다.' },
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '섹션 추가' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '추가' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('현재 요금제는 섹션을 10개까지 쓸 수 있습니다.'),
    )
  })
})

describe('섹션 삭제', () => {
  it('확인 창을 거쳐 삭제하면 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '두 번째 소개 삭제' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('노출 토글')
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(deletedId).toBe('s-2'))
    await waitFor(() => expect(screen.queryByText('두 번째 소개')).toBeNull())
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('취소하면 삭제하지 않는다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '소개 삭제' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(deletedId).toBeNull()
    expect(screen.getByRole('button', { name: '소개 삭제' })).toBeInTheDocument()
  })
})
