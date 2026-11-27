import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import type { ContentCategoryNode, ContentTag } from '@/hooks/useContentItems'
import type { ContentTypeList } from '@/hooks/useContentTypes'
import { ContentTaxonomyPage } from '@/pages/ContentTaxonomyPage'
import { useAuthStore } from '@/stores/authStore'

// 카테고리 · 태그 화면 (T-257, 콘텐츠 관리 기획서 CM-05) — MSW 로 실제 훅 · API 확인

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError } }
})

const BASE = 'http://localhost:8000/api'

const node = (id: string, children: ContentCategoryNode[] = []): ContentCategoryNode => ({
  id,
  name: id,
  parent_id: null,
  display_order: 0,
  item_count: 1,
  children,
})

let tree: ContentCategoryNode[]
let tags: ContentTag[]
let requests: { method: string; url: string; body: unknown; query: string }[]

const types: ContentTypeList = {
  enabled: true,
  types: [
    {
      id: 'type-faq',
      type_key: 'faq',
      name: 'FAQ',
      description: '',
      preset_key: 'faq',
      display_order: 0,
      fields: [],
      item_count: 0,
      published_count: 0,
      updated_at: '2026-11-27T00:00:00Z',
      deleted_at: null,
    },
  ],
  trash: [],
  limits: { plan: 'STANDARD', limit: 10, used: 1, can_create: true, reason: null },
  presets: [],
}

const record = async (request: Request) => {
  const body =
    request.method === 'GET' || request.method === 'DELETE'
      ? null
      : await request.json().catch(() => null)
  const url = new URL(request.url)
  requests.push({ method: request.method, url: url.pathname, body, query: url.search })
  return body
}

beforeEach(() => {
  toastSuccess.mockReset()
  toastError.mockReset()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  requests = []
  tree = [
    node('진료', [{ ...node('예약'), parent_id: '진료' }]),
    node('비용'),
    node('주차'),
  ]
  tags = [
    { id: 'tag-a', name: '이벤트', item_count: 2 },
    { id: 'tag-b', name: '행사', item_count: 1 },
  ]
  server.use(
    http.get(`${BASE}/v1/contents/types`, () => HttpResponse.json({ success: true, data: types })),
    http.get(`${BASE}/v1/contents/types/:id/categories`, () =>
      HttpResponse.json({ success: true, data: tree })
    ),
    http.post(`${BASE}/v1/contents/types/:id/categories`, async ({ request }) => {
      const body = (await record(request)) as { name: string }
      if (body.name === '진료')
        return HttpResponse.json(
          { success: false, error: { code: 'CONFLICT', message: '같은 이름의 카테고리가 이미 있어요.' } },
          { status: 409 }
        )
      return HttpResponse.json({ success: true, data: node(body.name) }, { status: 201 })
    }),
    http.put(`${BASE}/v1/contents/types/:id/categories/tree`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: tree })
    }),
    http.delete(`${BASE}/v1/contents/categories/:id`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: { moved: 1 } })
    }),
    http.get(`${BASE}/v1/contents/tags`, () => HttpResponse.json({ success: true, data: tags })),
    http.patch(`${BASE}/v1/contents/tags/:id`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: null })
    }),
    http.post(`${BASE}/v1/contents/tags/merge`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ success: true, data: { moved: 1 } })
    })
  )
})

const renderPage = () => {
  const router = createMemoryRouter(
    [{ path: '/admin/contents/taxonomy', element: <ContentTaxonomyPage /> }],
    { initialEntries: ['/admin/contents/taxonomy'] }
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

const treeSent = () =>
  (requests.find((r) => r.method === 'PUT')?.body as { nodes: unknown[] } | undefined)?.nodes

describe('ContentTaxonomyPage — 카테고리', () => {
  it('맨 위를 아래로 옮기면 하위도 함께 움직인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '진료 아래로' }))
    await waitFor(() =>
      expect(treeSent()).toEqual([
        { id: '비용', parent_id: null },
        { id: '진료', parent_id: null },
        { id: '예약', parent_id: '진료' },
        { id: '주차', parent_id: null },
      ])
    )
  })

  it('하위로 내리고 맨 위로 올린다 — 하위가 있으면 내릴 수 없다', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('button', { name: '진료 위 카테고리 아래로' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '주차 위 카테고리 아래로' }))
    await waitFor(() =>
      expect(treeSent()).toEqual([
        { id: '진료', parent_id: null },
        { id: '예약', parent_id: '진료' },
        { id: '비용', parent_id: null },
        { id: '주차', parent_id: '비용' },
      ])
    )
    requests = []
    await user.click(screen.getByRole('button', { name: '예약 맨 위로 올리기' }))
    await waitFor(() =>
      expect(treeSent()).toEqual([
        { id: '진료', parent_id: null },
        { id: '예약', parent_id: null },
        { id: '비용', parent_id: null },
        { id: '주차', parent_id: '비용' },
      ])
    )
  })

  it('새 카테고리 — 위치를 고르고, 같은 이름은 서버 안내', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('새 카테고리'), '야간')
    await user.selectOptions(screen.getByLabelText('새 카테고리 위치'), '진료')
    await user.click(screen.getByRole('button', { name: '카테고리 추가' }))
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        name: '야간',
        parent_id: '진료',
      })
    )
    await user.type(screen.getByLabelText('새 카테고리'), '진료')
    await user.click(screen.getByRole('button', { name: '카테고리 추가' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('같은 이름의 카테고리가 이미 있어요.')
    )
  })

  it('지우면서 콘텐츠를 다른 카테고리로 옮긴다 — 자기 하위는 고를 수 없다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '진료 지우기' }))
    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByRole('combobox')
    expect(within(select).queryByRole('option', { name: '예약' })).not.toBeInTheDocument()
    await user.selectOptions(select, '비용')
    await user.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'DELETE')).toMatchObject({
        url: '/api/v1/contents/categories/%EC%A7%84%EB%A3%8C',
        query: '?move_to=%EB%B9%84%EC%9A%A9',
      })
    )
    expect(toastSuccess).toHaveBeenCalledWith('지우고 콘텐츠 1개를 옮겼어요.')
  })
})

describe('ContentTaxonomyPage — 태그', () => {
  it('두 개 이상 고르면 합치기 — 남길 태그를 고른다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('이벤트 고르기'))
    expect(screen.queryByRole('button', { name: /합치기/ })).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('행사 고르기'))
    await user.click(screen.getByRole('button', { name: '고른 태그 2개 합치기' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /행사/ }))
    await user.click(within(dialog).getByRole('button', { name: '합치기' }))
    await waitFor(() =>
      expect(requests.find((r) => r.url.endsWith('/merge'))?.body).toEqual({
        source_ids: ['tag-a'],
        target_id: 'tag-b',
      })
    )
  })

  it('이름 바꾸기', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '이벤트 이름 바꾸기' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('이름')
    await user.clear(input)
    await user.type(input, 'EVENT')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')).toMatchObject({
        url: '/api/v1/contents/tags/tag-a',
        body: { name: 'EVENT' },
      })
    )
  })

  it('보기 전용은 바꾸는 버튼이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderPage()
    await screen.findByRole('list', { name: '태그 목록' })
    expect(screen.queryByRole('button', { name: '진료 지우기' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('이벤트 고르기')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('새 태그')).not.toBeInTheDocument()
  })
})
