import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardSetupPage } from '@/pages/BoardSetupPage'
import { useAuthStore } from '@/stores/authStore'

const { get, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, patch, post: vi.fn(), put: vi.fn() } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board = {
  id: 'b1',
  name: '보도자료',
  slug: 'press',
  description: '',
  board_type: 'LIST',
  post_count: 0,
  seo_title: '',
  seo_description: '',
  seo_index: true,
  status: 'ACTIVE',
  system_key: null,
  menu_parent: '',
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
} as unknown as Board

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const render = (options: { key: string; title: string }[], b: Board = board) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([b])
    if (url === '/v1/boards/menu-parents') return ok(options)
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code', reorderable: true, items: [] })
    return ok([])
  })
  patch.mockImplementation((_url: string, payload: Record<string, unknown>) =>
    ok({ ...b, ...payload })
  )
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: '/admin/boards/:boardId/settings', element: <BoardSetupPage /> }],
        { initialEntries: ['/admin/boards/b1/settings'] }
      )}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('메뉴 위치 — 2단계 메뉴 (T-216)', () => {
  it('페이지 묶음 아래를 고르면 저장 막대로 저장한다 (T-228)', async () => {
    render([
      { key: 'about', title: '회사소개' },
      { key: 'business', title: '사업영역' },
    ])
    const select = await screen.findByLabelText('메뉴 위치')
    expect(select).toHaveValue('')
    await userEvent.selectOptions(select, 'about')
    expect(patch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', { menu_parent: 'about' })
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('테마형 템플릿이면 고르는 칸 대신 안내', async () => {
    render([])
    expect(await screen.findByText(/지금 템플릿은 상단 메뉴만 있어요/)).toBeInTheDocument()
    expect(screen.queryByLabelText('메뉴 위치')).not.toBeInTheDocument()
  })

  it('고른 묶음이 지금 템플릿에 없으면 상단 메뉴로 보인다고 알린다', async () => {
    render([{ key: 'about', title: '회사소개' }], { ...board, menu_parent: 'careers' } as Board)
    expect(await screen.findByLabelText('메뉴 위치')).toHaveValue('')
    expect(screen.getByText(/지금 템플릿에 없어 상단 메뉴에 보입니다/)).toBeInTheDocument()
  })
})
