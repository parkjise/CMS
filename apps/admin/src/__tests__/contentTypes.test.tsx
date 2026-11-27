import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import type { ContentType, ContentTypeList } from '@/hooks/useContentTypes'
import { ContentTypeDetailPage } from '@/pages/ContentTypeDetailPage'
import { ContentTypesPage } from '@/pages/ContentTypesPage'
import { useAuthStore } from '@/stores/authStore'

// 콘텐츠 유형 화면 (T-255, 콘텐츠 관리 기획서 CM-03) — 실제 훅 · API 호출을 MSW 로 확인

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError } }
})

const BASE = 'http://localhost:8000/api'

const contentType = (key: string, over: Partial<ContentType> = {}): ContentType => ({
  id: `id-${key}`,
  type_key: key,
  name: key,
  description: '',
  preset_key: null,
  display_order: 0,
  fields: [],
  item_count: 0,
  published_count: 0,
  updated_at: '2026-11-27T00:00:00Z',
  deleted_at: null,
  ...over,
})

const HISTORY = contentType('history', {
  name: '연혁',
  preset_key: 'history',
  item_count: 2,
  published_count: 1,
  fields: [
    {
      id: 'f-year',
      field_key: 'year',
      label: '연도',
      field_type: 'NUMBER',
      is_required: true,
      help_text: '',
      placeholder: '',
      default_value: null,
      field_options: { min: 1900, max: 2100 },
      display_order: 0,
    },
  ],
})

const PRESETS = [
  { key: 'faq', name: '자주 묻는 질문', description: '질문과 답', fields: [] },
  { key: 'history', name: '연혁', description: '연도별', fields: ['연도', '월'] },
]

let list: ContentTypeList
let requests: { method: string; url: string; body: unknown }[]

const record = async (request: Request) => {
  const body =
    request.method === 'GET' || request.method === 'DELETE'
      ? null
      : await request.json().catch(() => null)
  requests.push({ method: request.method, url: new URL(request.url).pathname, body })
  return body as Record<string, unknown> | null
}

beforeEach(() => {
  toastSuccess.mockReset()
  toastError.mockReset()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  requests = []
  list = {
    enabled: true,
    types: [HISTORY],
    trash: [],
    limits: { plan: 'STANDARD', limit: 10, used: 1, can_create: true, reason: null },
    presets: PRESETS,
  }
  server.use(
    http.get(`${BASE}/v1/contents/types`, () => HttpResponse.json({ success: true, data: list })),
    http.get(`${BASE}/v1/contents/types/:id`, ({ params }) => {
      const found = list.types.find((t) => t.id === params.id)
      return found
        ? HttpResponse.json({ success: true, data: found })
        : HttpResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
    }),
    http.post(`${BASE}/v1/contents/types`, async ({ request }) => {
      const body = (await record(request)) as { preset_key?: string; type_key?: string }
      if (body.type_key === 'taken')
        return HttpResponse.json(
          {
            success: false,
            error: { code: 'CONFLICT', message: '이미 다른 유형이 쓰는 키예요.', field: 'type_key' },
          },
          { status: 409 }
        )
      const created = contentType(body.type_key ?? body.preset_key ?? 'x', { name: '새 유형' })
      list = { ...list, types: [...list.types, created] }
      return HttpResponse.json({ success: true, data: created }, { status: 201 })
    }),
    http.put(`${BASE}/v1/contents/types/:id/fields`, async ({ request }) => {
      const body = (await record(request)) as { fields: { label: string }[] }
      if (body.fields.some((f) => f.label === '충돌'))
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'CONFLICT',
              message: '이 칸에 값이 있는 콘텐츠가 있어 종류를 바꿀 수 없습니다.',
              field: 'fields.1.field_type',
            },
          },
          { status: 409 }
        )
      return HttpResponse.json({ success: true, data: HISTORY })
    }),
    http.patch(`${BASE}/v1/contents/types/:id`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: HISTORY })
    }),
    http.delete(`${BASE}/v1/contents/types/:id`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: null })
    })
  )
})

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      { path: '/admin/contents/types', element: <ContentTypesPage /> },
      { path: '/admin/contents/types/:typeId', element: <ContentTypeDetailPage /> },
    ],
    { initialEntries: [url] }
  )
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

describe('ContentTypesPage', () => {
  it('유형 목록 · 한도 · 칸 · 콘텐츠 수를 보여 준다', async () => {
    renderAt('/admin/contents/types')
    const rows = await screen.findByRole('list', { name: '콘텐츠 유형 목록' })
    expect(within(rows).getByText('연혁')).toBeInTheDocument()
    expect(within(rows).getByText(/history · 칸 1개 · 콘텐츠 2개 \(공개 1\)/)).toBeInTheDocument()
    expect(screen.getByText('유형 1 / 10')).toBeInTheDocument()
  })

  it('스위치가 꺼져 있으면 안내만 보이고 추가 버튼이 없다', async () => {
    list = { ...list, enabled: false }
    renderAt('/admin/contents/types')
    expect(await screen.findByText(/콘텐츠 관리가 아직 켜져 있지 않아요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '유형 추가' })).not.toBeInTheDocument()
  })

  it('요금제 한도면 추가 버튼이 막히고 이유를 보여 준다', async () => {
    list = {
      ...list,
      limits: {
        plan: 'BASIC',
        limit: 0,
        used: 0,
        can_create: false,
        reason: '콘텐츠 관리는 STANDARD 요금제부터 쓸 수 있습니다.',
      },
    }
    renderAt('/admin/contents/types')
    expect(await screen.findByRole('button', { name: '유형 추가' })).toBeDisabled()
    expect(screen.getByText(/STANDARD 요금제부터/)).toBeInTheDocument()
  })

  it('시작용 유형으로 만들고, 이미 쓰는 키면 키를 직접 받는다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/admin/contents/types')
    await user.click(await screen.findByRole('button', { name: '유형 추가' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(requests[0]?.body).toEqual({ preset_key: 'faq' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/contents/types/id-faq'))
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('이미 쓰는 시작용 키를 고르면 키 칸이 나오고 서버 오류를 그 칸에 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/types')
    await user.click(await screen.findByRole('button', { name: '유형 추가' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /연혁/ }))
    expect(within(dialog).getByText(/'history' 키를 이미 쓰고 있어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(within(dialog).getByText(/영문 소문자 · 숫자 · 하이픈/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('유형 키'), 'taken')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(await within(dialog).findByText('이미 다른 유형이 쓰는 키예요.')).toBeInTheDocument()
    expect(requests.at(-1)?.body).toEqual({ preset_key: 'history', type_key: 'taken' })
  })

  it('빈 유형은 이름과 키를 받는다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/types')
    await user.click(await screen.findByRole('button', { name: '유형 추가' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /빈 유형/ }))
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(within(dialog).getByText('유형 이름을 입력해 주세요.')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
    await user.type(within(dialog).getByLabelText('유형 이름'), '제품 소개')
    await user.type(within(dialog).getByLabelText('유형 키'), 'products')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    await waitFor(() =>
      expect(requests[0]?.body).toEqual({ name: '제품 소개', type_key: 'products' })
    )
  })

  it('콘텐츠가 남은 유형은 지우지 못하게 안내한다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/types')
    await user.click(await screen.findByRole('button', { name: '연혁 휴지통으로' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/콘텐츠가 2개 남아 있어요/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '휴지통으로' })).not.toBeInTheDocument()
  })

  it('보기 전용은 추가 · 지우기 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderAt('/admin/contents/types')
    await screen.findByRole('list', { name: '콘텐츠 유형 목록' })
    expect(screen.queryByRole('button', { name: '유형 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '연혁 휴지통으로' })).not.toBeInTheDocument()
  })
})

describe('ContentTypeDetailPage', () => {
  it('칸을 더하고 순서를 바꿔 목록 전체를 저장한다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/types/id-history')
    const save = await screen.findByRole('button', { name: '칸 저장' })
    expect(save).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '칸 추가' }))
    const rows = screen.getByRole('list', { name: '추가 칸 목록' })
    const newRow = within(rows).getAllByRole('listitem')[1]
    await user.type(within(newRow).getByLabelText('칸 이름'), '색상')
    await user.selectOptions(within(newRow).getByLabelText('종류'), 'SELECT')
    // 선택지 없이 저장하면 화면이 먼저 막는다
    await user.click(save)
    expect(within(newRow).getByRole('alert')).toHaveTextContent('선택지를 하나 이상')
    expect(requests).toHaveLength(0)
    await user.click(within(newRow).getByRole('button', { name: '선택지 추가' }))
    await user.type(within(newRow).getByLabelText('선택지 1'), '빨강')
    await user.click(within(newRow).getByRole('button', { name: '색상 위로' }))
    await user.click(save)
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({
      method: 'PUT',
      url: '/api/v1/contents/types/id-history/fields',
      body: {
        fields: [
          {
            label: '색상',
            field_type: 'SELECT',
            is_required: false,
            help_text: '',
            placeholder: '',
            options: [{ value: 'opt_1', label: '빨강' }],
          },
          {
            id: 'f-year',
            label: '연도',
            field_type: 'NUMBER',
            is_required: true,
            help_text: '',
            placeholder: '',
            min: 1900,
            max: 2100,
          },
        ],
      },
    })
    expect(toastSuccess).toHaveBeenCalledWith('칸을 저장했어요.')
  })

  it('서버가 알려 준 줄에 오류를 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/types/id-history')
    await user.click(await screen.findByRole('button', { name: '칸 추가' }))
    const rows = screen.getByRole('list', { name: '추가 칸 목록' })
    const newRow = within(rows).getAllByRole('listitem')[1]
    await user.type(within(newRow).getByLabelText('칸 이름'), '충돌')
    await user.click(screen.getByRole('button', { name: '칸 저장' }))
    expect(await within(newRow).findByRole('alert')).toHaveTextContent('종류를 바꿀 수 없습니다')
  })

  it('있던 칸 키는 바꿀 수 없게 보여 준다', async () => {
    renderAt('/admin/contents/types/id-history')
    expect(await screen.findByText('year')).toBeInTheDocument()
    expect(screen.getByText(/바꿀 수 없음/)).toBeInTheDocument()
  })

  it('기본 정보는 바뀐 값만 보낸다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/types/id-history')
    const name = await screen.findByLabelText('유형 이름')
    await user.clear(name)
    await user.type(name, '걸어온 길')
    await user.click(screen.getByRole('button', { name: '기본 정보 저장' }))
    await waitFor(() =>
      expect(requests[0]).toEqual({
        method: 'PATCH',
        url: '/api/v1/contents/types/id-history',
        body: { name: '걸어온 길' },
      })
    )
  })
})
