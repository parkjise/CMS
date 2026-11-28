import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import type { ContentItem, ContentItemList } from '@/hooks/useContentItems'
import type { ContentType, ContentTypeList } from '@/hooks/useContentTypes'
import { ContentItemEditPage } from '@/pages/ContentItemEditPage'
import { ContentItemsPage } from '@/pages/ContentItemsPage'
import { useAuthStore } from '@/stores/authStore'

// 콘텐츠 목록 · 작성 화면 (T-256, 콘텐츠 관리 기획서 CM-01 · 02) — MSW 로 실제 훅 · API 확인

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError } }
})

const BASE = 'http://localhost:8000/api'

const TEAM: ContentType = {
  id: 'type-team',
  type_key: 'team',
  name: '팀 · 의료진 소개',
  description: '',
  preset_key: 'team',
  display_order: 0,
  fields: [
    {
      id: 'f-role',
      field_key: 'role',
      label: '직책',
      field_type: 'TEXT',
      is_required: true,
      help_text: '',
      placeholder: '',
      default_value: null,
      field_options: {},
      display_order: 0,
    },
  ],
  item_count: 2,
  published_count: 1,
  updated_at: '2026-11-27T00:00:00Z',
  deleted_at: null,
}

const item = (id: string, over: Partial<ContentItem> = {}): ContentItem => ({
  id,
  type: { id: TEAM.id, type_key: 'team', name: TEAM.name },
  category_id: null,
  category_name: null,
  title: id,
  summary: '',
  body: [],
  data: {},
  thumbnail_url: null,
  status: 'DRAFT',
  published_at: null,
  display_order: 0,
  tags: [],
  created_at: '2026-11-27T00:00:00Z',
  updated_at: '2026-11-27T00:00:00Z',
  deleted_at: null,
  ...over,
})

let types: ContentTypeList
let items: ContentItem[]
let requests: { method: string; url: string; body: unknown; query?: string }[]

const record = async (request: Request) => {
  const body =
    request.method === 'GET' || request.method === 'DELETE'
      ? null
      : await request.json().catch(() => null)
  const url = new URL(request.url)
  requests.push({
    method: request.method,
    url: decodeURIComponent(url.pathname),
    body,
    query: url.search,
  })
  return body as Record<string, unknown> | null
}

const listOf = (): ContentItemList => ({
  items,
  total: items.length,
  page: 1,
  size: 20,
  counts: { all: items.length, published: 1, draft: items.length - 1, trash: 0 },
})

beforeEach(() => {
  toastSuccess.mockReset()
  toastError.mockReset()
  localStorage.clear()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  requests = []
  types = {
    enabled: true,
    types: [TEAM],
    trash: [],
    limits: { plan: 'STANDARD', limit: 10, used: 1, can_create: true, reason: null },
    presets: [],
  }
  items = [
    item('김원장', {
      status: 'PUBLISHED',
      data: { role: '대표원장' },
      tags: [{ id: 't1', name: '원장' }],
      category_name: '진료부',
    }),
    item('이실장'),
  ]
  server.use(
    http.get(`${BASE}/v1/contents/types`, () => HttpResponse.json({ success: true, data: types })),
    http.get(`${BASE}/v1/contents/types/:id`, () => HttpResponse.json({ success: true, data: TEAM })),
    http.get(`${BASE}/v1/contents/types/:id/categories`, () =>
      HttpResponse.json({
        success: true,
        data: [
          { id: 'c1', name: '진료부', parent_id: null, display_order: 0, item_count: 1, children: [] },
        ],
      })
    ),
    http.get(`${BASE}/v1/contents/tags`, () =>
      HttpResponse.json({ success: true, data: [{ id: 't1', name: '원장', item_count: 1 }] })
    ),
    http.get(`${BASE}/v1/contents/items`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: listOf() })
    }),
    http.get(`${BASE}/v1/contents/items/:id`, ({ params }) => {
      const found = items.find((i) => i.id === params.id)
      return found
        ? HttpResponse.json({ success: true, data: found })
        : HttpResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
    }),
    http.post(`${BASE}/v1/contents/items`, async ({ request }) => {
      const body = (await record(request)) as { title: string }
      const created = item('new-id', { title: body.title })
      items = [...items, created]
      return HttpResponse.json({ success: true, data: created }, { status: 201 })
    }),
    http.patch(`${BASE}/v1/contents/items/:id`, async ({ request, params }) => {
      const body = (await record(request)) as { data?: Record<string, unknown> }
      if (body.data && body.data.role === '거절')
        return HttpResponse.json(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '글자 수가 너무 많습니다.', field: 'data.role' },
          },
          { status: 400 }
        )
      return HttpResponse.json({ success: true, data: items.find((i) => i.id === params.id) })
    }),
    http.post(`${BASE}/v1/contents/items/bulk`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: { changed: 1, skipped: ['이실장'] } })
    }),
    http.post(`${BASE}/v1/contents/items/:id/duplicate`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: item('copy') }, { status: 201 })
    }),
    http.get(`${BASE}/v1/contents/:kind/:id/usage`, () =>
      HttpResponse.json({
        success: true,
        data: [
          { section_id: 's1', label: '의료진', page_key: 'about', page_title: '회사소개', is_active: true },
        ],
      })
    ),
    http.delete(`${BASE}/v1/contents/items/:id`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: null })
    })
  )
})

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      { path: '/admin/contents', element: <ContentItemsPage /> },
      { path: '/admin/contents/new', element: <ContentItemEditPage /> },
      { path: '/admin/contents/:itemId', element: <ContentItemEditPage /> },
    ],
    { initialEntries: [url] }
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

describe('ContentItemsPage', () => {
  it('상태별 수 · 유형 · 카테고리 · 태그를 보여 준다', async () => {
    renderAt('/admin/contents')
    const list = await screen.findByRole('list', { name: '콘텐츠 목록' })
    expect(within(list).getByText('김원장')).toBeInTheDocument()
    expect(within(list).getByText(/팀 · 의료진 소개 · 진료부 · #원장/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '전체 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '공개 1' })).toBeInTheDocument()
  })

  it('상태 탭 · 검색 · 유형을 서버 조건으로 보낸다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents')
    await screen.findByRole('list', { name: '콘텐츠 목록' })
    await user.click(screen.getByRole('tab', { name: /초안/ }))
    await waitFor(() => expect(requests.at(-1)?.query).toContain('status=DRAFT'))
    await user.type(screen.getByLabelText('콘텐츠 검색'), '김')
    await waitFor(() => expect(requests.at(-1)?.query).toContain('q=%EA%B9%80'))
    await user.selectOptions(screen.getByLabelText('유형'), TEAM.id)
    await waitFor(() => expect(requests.at(-1)?.query).toContain(`type_id=${TEAM.id}`))
    // 유형을 고르면 카테고리 고르기가 나온다
    expect(await screen.findByLabelText('카테고리')).toBeInTheDocument()
  })

  it('여러 개 공개 — 필수 칸이 빈 항목은 알려 준다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents')
    await screen.findByRole('list', { name: '콘텐츠 목록' })
    await user.click(screen.getByLabelText('이 쪽 모두 고르기'))
    const bar = screen.getByRole('region', { name: '고른 콘텐츠' })
    await user.click(within(bar).getByRole('button', { name: '공개' }))
    await waitFor(() =>
      expect(requests.find((r) => r.url.endsWith('/bulk'))?.body).toEqual({
        ids: ['김원장', '이실장'],
        action: 'publish',
      })
    )
    expect(toastSuccess).toHaveBeenCalledWith('1개를 공개했어요.')
    expect(toastError).toHaveBeenCalledWith('1개는 필수 칸이 비어 있어 공개하지 못했어요.')
  })

  it('복제 · 휴지통 버튼이 그 항목으로 부른다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents')
    await user.click(await screen.findByRole('button', { name: '이실장 복제' }))
    await user.click(screen.getByRole('button', { name: '이실장 휴지통으로' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '휴지통으로' }))
    await waitFor(() =>
      expect(requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.url}`)).toEqual([
        'POST /api/v1/contents/items/이실장/duplicate',
        'DELETE /api/v1/contents/items/이실장',
      ])
    )
  })

  it('유형이 없으면 유형부터 만들라고 안내한다', async () => {
    types = { ...types, types: [] }
    renderAt('/admin/contents')
    expect(await screen.findByText('먼저 콘텐츠 유형을 만들어 주세요')).toBeInTheDocument()
  })

  it('보기 전용은 작성 · 고르기 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderAt('/admin/contents')
    await screen.findByRole('list', { name: '콘텐츠 목록' })
    expect(screen.queryByRole('button', { name: '콘텐츠 작성' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('이 쪽 모두 고르기')).not.toBeInTheDocument()
  })
})

describe('ContentItemEditPage', () => {
  it('유형 없이 들어오면 유형부터 고른다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/admin/contents/new')
    await screen.findByRole('option', { name: TEAM.name })
    await user.selectOptions(screen.getByLabelText('유형 고르기'), TEAM.id)
    await waitFor(() => expect(router.state.location.search).toBe(`?type=${TEAM.id}`))
    expect(await screen.findByLabelText('제목')).toBeInTheDocument()
  })

  it('공개는 필수 칸을 먼저 검사하고, 초안은 그대로 저장한다', { timeout: 20000 }, async () => {
    const user = userEvent.setup()
    const router = renderAt(`/admin/contents/new?type=${TEAM.id}`)
    await user.type(await screen.findByLabelText('제목'), '박원장')
    await user.click(screen.getByRole('button', { name: '공개' }))
    expect(await screen.findByText('필수 칸입니다.')).toBeInTheDocument()
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
    await user.type(screen.getByLabelText('태그'), '원장{Enter}')
    await user.click(screen.getByRole('button', { name: '초안 저장' }))
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        type_id: TEAM.id,
        title: '박원장',
        summary: '',
        body: [],
        data: { role: null },
        thumbnail_url: null,
        category_id: null,
        tags: ['원장'],
        status: 'DRAFT',
      })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/contents/new-id'))
  })

  it('공개 중인 콘텐츠는 [저장] · [초안으로 돌리기], 서버 칸 오류는 그 칸에', async () => {
    const user = userEvent.setup()
    renderAt('/admin/contents/김원장')
    const role = await screen.findByDisplayValue('대표원장')
    expect(screen.getByRole('button', { name: '초안으로 돌리기' })).toBeInTheDocument()
    await user.clear(role)
    await user.type(role, '거절')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('글자 수가 너무 많습니다.')).toBeInTheDocument()
    const sent = requests.find((r) => r.method === 'PATCH')?.body as Record<string, unknown>
    expect(sent.status).toBe('PUBLISHED')
    expect(sent.tags).toEqual(['원장'])
    expect(sent.category_id).toBeNull()
  })

  it('브라우저에 남은 보관본을 불러온다', async () => {
    localStorage.setItem(
      `cms-content-draft:${TEAM.id}:new`,
      JSON.stringify({
        saved_at: '2026-11-27T01:00:00Z',
        title: '쓰다 만 제목',
        summary: '',
        body: [],
        thumbnail_url: '',
        category_id: '',
        tags: ['보관'],
        data: { role: '실장' },
      })
    )
    const user = userEvent.setup()
    renderAt(`/admin/contents/new?type=${TEAM.id}`)
    await user.click(await screen.findByRole('button', { name: '불러오기' }))
    expect(screen.getByLabelText('제목')).toHaveValue('쓰다 만 제목')
    expect(screen.getByDisplayValue('실장')).toBeInTheDocument()
    expect(screen.getByText('#보관')).toBeInTheDocument()
  })
})
