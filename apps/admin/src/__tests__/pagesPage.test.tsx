import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from './server'
import { ContentRedirect } from '@/components/pages/ContentRedirect'
import type { Page, PageList } from '@/hooks/usePages'
import { PageDetailPage } from '@/pages/PageDetailPage'
import { PagesPage } from '@/pages/PagesPage'
import { useAuthStore } from '@/stores/authStore'

// 페이지 관리 화면 (T-238, 기획서 PM-01 · PM-02) — 실제 훅 · API 호출을 MSW 로 확인

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError } }
})

const BASE = 'http://localhost:8000/api'

const page = (key: string, over: Partial<Page> = {}): Page => ({
  id: `id-${key}`,
  page_key: key,
  title: key === 'home' ? '홈' : key,
  origin: 'CUSTOM',
  parent_key: null,
  show_in_menu: true,
  is_public: true,
  display_order: 0,
  seo_title: null,
  seo_description: null,
  og_image_url: null,
  noindex: false,
  section_count: 0,
  updated_at: '2026-11-24T00:00:00Z',
  deleted_at: null,
  ...over,
})

const HOME = page('home', { origin: 'TEMPLATE', section_count: 3 })

let list: PageList
let requests: { method: string; url: string; body: unknown }[]
let keyCheck: (key: string) => { available: boolean; reason: string | null }

const listOf = (over: Partial<PageList> = {}): PageList => ({
  enabled: true,
  pages: [HOME, page('event', { title: '이벤트', is_public: false, section_count: 2 })],
  trash: [],
  limits: { plan: 'STANDARD', limit: 10, used: 1, can_create: true, reason: null },
  ...over,
})

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
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' }, tenantSlug: 'hana' } as never)
  list = listOf()
  requests = []
  keyCheck = () => ({ available: true, reason: null })
  server.use(
    http.get(`${BASE}/v1/pages`, () => HttpResponse.json({ success: true, data: list })),
    http.get(`${BASE}/v1/pages/check-key`, ({ request }) => {
      const key = new URL(request.url).searchParams.get('key') ?? ''
      return HttpResponse.json({ success: true, data: keyCheck(key) })
    }),
    http.post(`${BASE}/v1/pages`, async ({ request }) => {
      const body = (await record(request)) as { page_key: string; title: string }
      if (body.page_key === 'taken')
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'CONFLICT',
              message: '이미 다른 페이지가 쓰는 주소예요.',
              field: 'page_key',
            },
          },
          { status: 409 }
        )
      const created = page(body.page_key, { title: body.title, is_public: false })
      list = { ...list, pages: [...list.pages, created] }
      return HttpResponse.json({ success: true, data: created }, { status: 201 })
    }),
    http.patch(`${BASE}/v1/pages/:id`, async ({ request, params }) => {
      const body = (await record(request)) as Partial<Page>
      const before = list.pages.find((p) => p.id === params.id)!
      const saved = { ...before, ...body }
      list = { ...list, pages: list.pages.map((p) => (p.id === params.id ? saved : p)) }
      return HttpResponse.json({ success: true, data: saved })
    }),
    http.delete(`${BASE}/v1/pages/:id`, async ({ request, params }) => {
      await record(request)
      const gone = list.pages.find((p) => p.id === params.id)!
      list = {
        ...list,
        pages: list.pages.filter((p) => p.id !== params.id),
        trash: [{ ...gone, deleted_at: '2026-11-24T01:00:00Z' }],
      }
      return HttpResponse.json({ success: true, data: null })
    }),
    http.post(`${BASE}/v1/pages/:id/restore`, async ({ request, params }) => {
      await record(request)
      const back = list.trash.find((p) => p.id === params.id)!
      list = { ...list, pages: [...list.pages, { ...back, deleted_at: null }], trash: [] }
      return HttpResponse.json({ success: true, data: back })
    }),
    http.get(`${BASE}/v1/pages/:id/usage`, () =>
      HttpResponse.json({
        success: true,
        data: { menu: ['이벤트'], sections: [{ id: 's1', label: '배너', page_key: 'home' }] },
      })
    ),
    http.get(`${BASE}/v1/sections`, () => HttpResponse.json({ success: true, data: [] })),
    http.get(`${BASE}/v1/sections/limits`, () =>
      HttpResponse.json({
        success: true,
        data: {
          plan_type: 'STANDARD',
          count: 0,
          limit: 10,
          can_add: true,
          can_delete: true,
          reason: null,
          addable_types: [],
        },
      })
    )
  )
})

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      { path: '/admin/pages', element: <PagesPage /> },
      { path: '/admin/pages/:pageKey', element: <PageDetailPage /> },
      { path: '/admin/pages/:pageKey/sections/:sectionId', element: <p>섹션 편집 화면</p> },
      { path: '/admin/content', element: <ContentRedirect /> },
      { path: '/admin/content/:sectionId', element: <ContentRedirect /> },
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

describe('미리보기 · 화면에서 편집 (T-244, PM-06)', () => {
  it('숨김 페이지는 미리보기만 — 누르면 미리보기 주소를 새 탭으로 연다', async () => {
    const win = { opener: {}, location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
    server.use(
      http.post(`${BASE}/v1/pages/:id/preview`, async ({ request, params }) => {
        await record(request)
        return HttpResponse.json({
          success: true,
          data: { token: 'tok', page_key: params.id === 'id-event' ? 'event' : 'home', expires_in: 600 },
        })
      })
    )
    renderAt('/admin/pages')
    const rows = within(await screen.findByRole('list', { name: '페이지 목록' })).getAllByRole(
      'listitem'
    )
    // 공개된 홈은 홈페이지로 바로, 숨긴 페이지는 미리보기에서만
    expect(within(rows[0]).getByRole('link', { name: '홈 화면에서 편집' })).toHaveAttribute(
      'href',
      'http://localhost:3000/hana'
    )
    expect(within(rows[1]).queryByRole('link', { name: /화면에서 편집/ })).toBeNull()
    await userEvent.click(within(rows[1]).getByRole('button', { name: '이벤트 미리보기' }))
    await waitFor(() =>
      expect(win.location.href).toBe('http://localhost:3000/hana/preview?draft=tok&page=event')
    )
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(win.opener).toBeNull()
    expect(requests).toContainEqual({ method: 'POST', url: '/api/v1/pages/id-event/preview', body: null })
    open.mockRestore()
  })

  it('페이지 편집 화면에도 같은 버튼, 보기 전용은 미리보기 없이', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderAt('/admin/pages/home')
    expect(await screen.findByRole('link', { name: /화면에서 편집/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /미리보기/ })).toBeNull()
  })
})

describe('페이지 목록 (PM-01)', () => {
  it('기본 · 직접 · 숨김 · 섹션 수와 한도를 보여 준다', async () => {
    renderAt('/admin/pages')
    const rows = within(await screen.findByRole('list', { name: '페이지 목록' })).getAllByRole(
      'listitem'
    )
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('기본')).toBeInTheDocument()
    expect(within(rows[0]).getByText('/ · 섹션 3개 · 수정 2026.11.24')).toBeInTheDocument()
    expect(within(rows[1]).getByText('직접')).toBeInTheDocument()
    expect(within(rows[1]).getByText('숨김')).toBeInTheDocument()
    expect(screen.getByText('직접 만든 페이지 1 / 10')).toBeInTheDocument()
    // 홈은 지울 수 없고 순서도 맨 앞
    expect(within(rows[0]).queryByRole('button', { name: /휴지통으로/ })).not.toBeInTheDocument()
    expect(within(rows[0]).queryByRole('button', { name: /순서 바꾸기/ })).not.toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: '이벤트 순서 바꾸기' })).toBeInTheDocument()
  })

  it('스위치가 꺼져 있으면 기본 페이지만 · 추가 · 휴지통 · 복제 없음', async () => {
    list = listOf({ enabled: false, pages: [HOME] })
    renderAt('/admin/pages')
    await screen.findByRole('list', { name: '페이지 목록' })
    expect(screen.queryByRole('button', { name: /페이지 추가/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /복제/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/아직 직접 만든 페이지가 없어요/)).not.toBeInTheDocument()
  })

  it('보기 전용 계정은 읽기만', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderAt('/admin/pages')
    await screen.findByRole('list', { name: '페이지 목록' })
    expect(screen.queryByRole('button', { name: /페이지 추가/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /휴지통으로/ })).not.toBeInTheDocument()
  })

  it('한도가 차면 추가를 막고 이유를 보여 준다, 직접 만든 페이지가 없으면 빈 안내', async () => {
    list = listOf({
      pages: [HOME],
      limits: {
        plan: 'BASIC',
        limit: 0,
        used: 0,
        can_create: false,
        reason: '페이지 추가는 STANDARD 요금제부터 쓸 수 있습니다.',
      },
    })
    renderAt('/admin/pages')
    expect(await screen.findByRole('button', { name: /페이지 추가/ })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('STANDARD 요금제부터')
    expect(screen.getByText('아직 직접 만든 페이지가 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '첫 페이지 만들기' })).not.toBeInTheDocument()
  })

  it('검색 · 필터 중에는 끌어서 순서를 바꿀 수 없다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/pages')
    await screen.findByRole('list', { name: '페이지 목록' })
    await user.selectOptions(screen.getByRole('combobox', { name: '공개 상태' }), 'hidden')
    const rows = within(screen.getByRole('list', { name: '페이지 목록' })).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /순서 바꾸기/ })).not.toBeInTheDocument()
    expect(screen.getByText(/필터를 지우면/)).toBeInTheDocument()
  })
})

describe('페이지 추가 (PM-02)', () => {
  it('이름 · 주소를 넣으면 숨김으로 만들고 그 페이지 편집으로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/admin/pages')
    await user.click(await screen.findByRole('button', { name: /페이지 추가/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/페이지 이름/), '의료진 소개')
    await user.type(within(dialog).getByLabelText(/주소/), 'Doctors')
    expect(await within(dialog).findByText('사용할 수 있는 주소예요.')).toBeInTheDocument()
    expect(within(dialog).getByText('/hana/')).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText(/상위 페이지/), 'event')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/pages/doctors'))
    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/api/v1/pages',
        body: { title: '의료진 소개', page_key: 'doctors', parent_key: 'event', is_public: false },
      },
    ])
  })

  it('형식 · 사용 중인 주소는 칸에 이유를 보여 주고 만들지 않는다', async () => {
    const user = userEvent.setup()
    keyCheck = (key) =>
      key === 'about'
        ? { available: false, reason: '지금 템플릿의 기본 페이지 주소예요.' }
        : { available: true, reason: null }
    renderAt('/admin/pages')
    await user.click(await screen.findByRole('button', { name: /페이지 추가/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/페이지 이름/), '소개')
    await user.type(within(dialog).getByLabelText(/주소/), 'a')
    expect(within(dialog).getByText(/2~40자/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/주소/), 'bout')
    expect(
      await within(dialog).findByText('지금 템플릿의 기본 페이지 주소예요.')
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(requests).toEqual([])
  })

  it('서버가 주소를 막으면 주소 칸에 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/pages')
    await user.click(await screen.findByRole('button', { name: /페이지 추가/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/페이지 이름/), '중복')
    await user.type(within(dialog).getByLabelText(/주소/), 'taken')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(await within(dialog).findByText('이미 다른 페이지가 쓰는 주소예요.')).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('휴지통', () => {
  it('지우기 확인 → 휴지통 탭에서 복구', async () => {
    const user = userEvent.setup()
    renderAt('/admin/pages')
    await user.click(await screen.findByRole('button', { name: '이벤트 휴지통으로' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('섹션 2개')
    // 이 페이지로 연결된 메뉴 · 섹션 링크 (T-242)
    const note = await within(dialog).findByRole('note')
    expect(note).toHaveTextContent("메뉴 '이벤트'")
    expect(note).toHaveTextContent("홈 페이지의 '배너' 섹션 링크")
    await user.click(within(dialog).getByRole('button', { name: '휴지통으로' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: '휴지통 1' })).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: '휴지통 1' }))
    await user.click(
      within(screen.getByRole('list', { name: '휴지통' })).getByRole('button', { name: /복구/ })
    )
    await waitFor(() => expect(screen.getByRole('tab', { name: '휴지통 0' })).toBeInTheDocument())
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'DELETE /api/v1/pages/id-event',
      'POST /api/v1/pages/id-event/restore',
    ])
  })
})

describe('페이지 설정 (PM-02)', () => {
  it('바뀐 칸만 보내고, 주소를 바꾸면 새 주소 화면으로', async () => {
    const user = userEvent.setup()
    const router = renderAt('/admin/pages/event?tab=settings')
    const keyInput = await screen.findByLabelText(/^주소/)
    await user.clear(keyInput)
    await user.type(keyInput, 'winter')
    await user.type(screen.getByLabelText('검색 제목'), '겨울 이벤트')
    await screen.findByText('사용할 수 있는 주소예요.')
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/pages/winter'))
    expect(router.state.location.search).toBe('?tab=settings')
    expect(requests).toEqual([
      {
        method: 'PATCH',
        url: '/api/v1/pages/id-event',
        body: { page_key: 'winter', seo_title: '겨울 이벤트' },
      },
    ])
  })

  it('공유 이미지를 넣어 저장하고, 지우면 null 로 보낸다 (T-245)', async () => {
    const user = userEvent.setup()
    renderAt('/admin/pages/event?tab=settings')
    await user.click(await screen.findByRole('button', { name: '공유 이미지 주소로 넣기' }))
    await user.type(screen.getByLabelText('공유 이미지 주소'), 'https://cdn.test/og.webp')
    expect(screen.getByAltText('현재 이미지')).toHaveAttribute('src', 'https://cdn.test/og.webp')
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('페이지 설정을 저장했어요.'))
    expect(requests.at(-1)?.body).toEqual({ og_image_url: 'https://cdn.test/og.webp' })

    await user.click(screen.getByRole('button', { name: '공유 이미지 삭제' }))
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests.at(-1)?.body).toEqual({ og_image_url: null })
  })

  it('템플릿 기본 페이지(홈)는 주소 · 상위 · 공개 · 메뉴 칸이 없다', async () => {
    renderAt('/admin/pages/home?tab=settings')
    expect(await screen.findByText(/템플릿 기본 페이지라 주소/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^주소/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/상위 페이지/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('홈페이지에 공개')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('메뉴에 표시')).not.toBeInTheDocument()
    // 홈은 사이트 SEO 설정을 쓴다 — 페이지 SEO 칸 대신 그 화면으로 (T-245)
    expect(screen.queryByLabelText('검색 제목')).not.toBeInTheDocument()
    expect(screen.queryByText('공유 이미지')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SEO 설정/ })).toHaveAttribute(
      'href',
      '/admin/site/seo'
    )
  })

  it('스위치가 꺼져 있으면 설정 탭 없이 섹션만', async () => {
    list = listOf({ enabled: false })
    renderAt('/admin/pages/event?tab=settings')
    expect(await screen.findByRole('heading', { name: '이벤트' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '설정' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('검색 제목')).not.toBeInTheDocument()
  })

  it('없는 페이지는 안내', async () => {
    renderAt('/admin/pages/nope')
    expect(await screen.findByText(/페이지를 찾을 수 없어요/)).toBeInTheDocument()
  })
})

describe('예전 콘텐츠 편집 주소', () => {
  it.each([
    ['/admin/content', '/admin/pages/home'],
    ['/admin/content/s1', '/admin/pages/home/sections/s1'],
  ])('%s → %s', async (from, to) => {
    const router = renderAt(from)
    await waitFor(() => expect(router.state.location.pathname).toBe(to))
  })
})
