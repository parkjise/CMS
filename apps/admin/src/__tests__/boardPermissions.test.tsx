import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardPermissionsPage } from '@/pages/BoardPermissionsPage'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'

const { get, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, patch } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  id: 'b1',
  name: '회원 소식',
  slug: 'members',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  post_count: 1,
  has_samples: false,
  deleted_at: null,
  sort_order: 'LATEST',
  page_size: null,
  seo_title: '',
  seo_description: '',
  seo_index: true,
  design: {
    columns: 3,
    image_ratio: '4:3',
    show_date: true,
    show_image: true,
    show_summary: true,
    faq_single_open: false,
    faq_first_open: false,
  },
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
}

const setRole = (role: string) => useAuthStore.setState({ user: { role } } as never)
const setMemberFeature = (on: boolean) =>
  useFeatureStore.setState({ settled: true, isEnabled: (key: string) => (key === 'SITE_MEMBER' ? on : true) })

const renderPage = (boards: Board[] = [board]) => {
  get.mockImplementation((url: string) =>
    url === '/v1/boards' ? Promise.resolve({ data: { data: boards } }) : Promise.resolve({ data: { data: null } }),
  )
  return renderWithQuery(
    <MemoryRouter initialEntries={['/admin/boards/b1/permissions']}>
      <Routes>
        <Route path="/admin/boards/:boardId/permissions" element={<BoardPermissionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
  setMemberFeature(true)
})

describe('게시판 권한', () => {
  it('회원만 읽기로 바꿔 저장한다', async () => {
    patch.mockResolvedValue({ data: { data: board } })
    renderPage()
    const save = await screen.findByRole('button', { name: '저장' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/회원만/))
    expect(screen.getByText(/로그인 안내가 나옵니다/)).toBeInTheDocument()
    await userEvent.click(save)
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', { permissions: { read: 'MEMBER', write: 'ADMIN' } }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('서버가 거절하면 메시지를 보여 준다', async () => {
    patch.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: { message: '방문자 회원 기능이 꺼져 있어' } } },
    })
    renderPage()
    await userEvent.click(await screen.findByLabelText(/회원만/))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('회원 기능이 꺼져 있으면 회원만을 고를 수 없다', async () => {
    setMemberFeature(false)
    renderPage()
    expect(await screen.findByLabelText(/회원만/)).toBeDisabled()
    expect(screen.getByText(/회원만 읽기를 고를 수 없습니다/)).toBeInTheDocument()
  })

  it('이미 회원만인데 회원 기능이 꺼졌으면 경고하고 누구나로 되돌릴 수 있다', async () => {
    setMemberFeature(false)
    renderPage([{ ...board, permissions: { read: 'MEMBER', write: 'ADMIN' } }])
    expect(await screen.findByText(/아무도 이 게시판의 글을 읽을 수 없습니다/)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/누구나/))
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  it('보기 전용 계정은 저장 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    renderPage()
    expect(await screen.findByLabelText(/누구나/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  it('기본 게시판은 권한을 바꿀 수 없다', async () => {
    renderPage([{ ...board, system_key: 'notice' }])
    expect(await screen.findByText(/기본 게시판은 누구나 읽을 수 있고/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/회원만/)).not.toBeInTheDocument()
  })
})
