import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { http, HttpResponse } from 'msw'
import { toast } from '@cms/ui'
import { server } from './server'
import { SectionEditorPage } from '@/pages/SectionEditorPage'
import { useAuthStore } from '@/stores/authStore'

const BASE = 'http://localhost:8000/api'

const section = {
  id: 's1',
  tenant_id: 't1',
  section_type: 'HERO_BANNER',
  label: '메인 배너',
  display_order: 0,
  is_active: true,
  page_key: 'home',
  settings: [{ field_key: 'main_title', field_value: '원래 제목', value_type: 'STRING' }],
  created_at: '2026-11-12T00:00:00Z',
  updated_at: '2026-11-12T00:00:00Z',
}

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/content/s1']}>
        <Routes>
          <Route path="/admin/content/:sectionId" element={<SectionEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('섹션 편집 [미리보기] (T-206)', () => {
  let tab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never, tenantSlug: 'clinic' })
    tab = { opener: 'admin', location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  })
  afterEach(() => vi.restoreAllMocks())

  it('저장하지 않고 미리보기 토큰을 받아 새 탭에 홈페이지 미리보기를 연다', async () => {
    const user = userEvent.setup()
    let previewBody: Record<string, unknown> | null = null
    const patch = vi.fn()
    server.use(
      http.get(`${BASE}/v1/sections/s1`, () => HttpResponse.json({ success: true, data: section })),
      http.post(`${BASE}/v1/sections/s1/preview`, async ({ request }) => {
        previewBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          success: true,
          data: { token: 'tok123', page_key: 'about', expires_in: 600 },
        })
      }),
      http.patch(`${BASE}/v1/sections/s1`, () => {
        patch()
        return HttpResponse.json({ success: true, data: section })
      }),
    )
    renderPage()
    const title = await screen.findByDisplayValue('원래 제목')
    await user.clear(title)
    await user.type(title, '새 제목')
    await user.click(screen.getByRole('button', { name: '미리보기' }))

    await waitFor(() =>
      expect(tab.location.href).toBe('http://localhost:3000/clinic/preview?draft=tok123&page=about'),
    )
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expect(tab.opener).toBeNull()
    expect(previewBody).toMatchObject({
      settings: expect.arrayContaining([
        expect.objectContaining({ field_key: 'main_title', field_value: '새 제목' }),
      ]),
    })
    expect(patch).not.toHaveBeenCalled()

    // 다음 [변경사항 저장]은 그대로 저장
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(window.open).toHaveBeenCalledTimes(1)
  })

  it('미리보기가 실패하면 빈 탭을 닫고 안내한다', async () => {
    const user = userEvent.setup()
    const error = vi.spyOn(toast, 'error')
    server.use(
      http.get(`${BASE}/v1/sections/s1`, () => HttpResponse.json({ success: true, data: section })),
      http.post(`${BASE}/v1/sections/s1/preview`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: '주소 형식이 올바르지 않습니다.' } },
          { status: 400 },
        ),
      ),
    )
    renderPage()
    await screen.findByDisplayValue('원래 제목')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('주소 형식이 올바르지 않습니다.'))
    expect(tab.close).toHaveBeenCalled()
  })

  it('새 탭이 차단돼도 저장하지 않고 팝업 허용을 안내한다', async () => {
    const user = userEvent.setup()
    vi.mocked(window.open).mockReturnValue(null)
    const error = vi.spyOn(toast, 'error')
    const patch = vi.fn()
    server.use(
      http.get(`${BASE}/v1/sections/s1`, () => HttpResponse.json({ success: true, data: section })),
      http.patch(`${BASE}/v1/sections/s1`, () => {
        patch()
        return HttpResponse.json({ success: true, data: section })
      }),
    )
    renderPage()
    await screen.findByDisplayValue('원래 제목')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining('팝업을 허용')))
    expect(patch).not.toHaveBeenCalled()
  })
})
