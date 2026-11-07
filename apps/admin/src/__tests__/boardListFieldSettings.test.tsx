import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { BoardField } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardListFieldSettings } from '@/components/boards/BoardListFieldSettings'
import { useAuthStore } from '@/stores/authStore'

const { get, patch, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, patch } }))
vi.mock('@cms/ui', async (original) => ({ ...(await original<typeof import('@cms/ui')>()), toast }))
const field = (extra: Partial<BoardField> = {}): BoardField => ({
  id: 'f1',
  board_id: 'b1',
  field_key: 'team',
  label: '담당 부서',
  field_type: 'TEXT',
  is_required: false,
  is_visible: true,
  help_text: '',
  placeholder: '',
  default_value: null,
  options: [],
  min: null,
  max: null,
  show_in_list: false,
  display_order: 0,
  deleted_at: null,
  value_count: 0,
  ...extra,
})
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const renderSettings = () =>
  renderWithQuery(
    <MemoryRouter>
      <BoardListFieldSettings boardId="b1" />
    </MemoryRouter>
  )
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('디자인 탭 목록 추가 정보', () => {
  it('선택을 즉시 기존 API에 저장하고 재조회한 값을 표시한다', async () => {
    let saved = field()
    get.mockImplementation(() => ok([saved]))
    patch.mockImplementation((_url, body) => {
      saved = { ...saved, ...body }
      return ok(saved)
    })
    renderSettings()
    const input = await screen.findByRole('checkbox', { name: '담당 부서' })
    expect(input).not.toBeChecked()
    await userEvent.click(input)
    await waitFor(() => expect(input).toBeChecked())
    expect(patch).toHaveBeenCalledWith('/v1/boards/b1/fields/f1', { show_in_list: true })
    await userEvent.click(input)
    await waitFor(() => expect(input).not.toBeChecked())
    expect(patch).toHaveBeenLastCalledWith('/v1/boards/b1/fields/f1', { show_in_list: false })
  })
  it('실패하면 기존 선택을 유지하고 오류를 안내한다', async () => {
    get.mockImplementation(() => ok([field({ show_in_list: true })]))
    patch.mockRejectedValue(new Error('failed'))
    renderSettings()
    const input = await screen.findByRole('checkbox', { name: '담당 부서' })
    await userEvent.click(input)
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(input).toBeChecked()
    expect(input).toBeEnabled()
  })
  it('저장 중에는 다른 칸까지 잠가 중복 변경을 막는다', async () => {
    get.mockImplementation(() => ok([field(), field({ id: 'f2', label: '접수일' })]))
    let done!: (value: unknown) => void
    patch.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve
        })
    )
    renderSettings()
    await userEvent.click(await screen.findByRole('checkbox', { name: '담당 부서' }))
    expect(screen.getByRole('checkbox', { name: '접수일' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: '접수일' }))
    expect(patch).toHaveBeenCalledTimes(1)
    await act(async () => done({ data: { data: field() } }))
  })
  it('홈페이지 비표시는 안내하되 관리자 목록 설정은 허용하고 삭제한 칸은 뺀다', async () => {
    get.mockImplementation(() =>
      ok([
        field({ is_visible: false }),
        field({ id: 'f2', label: '삭제한 칸', deleted_at: '2026-11-07' }),
      ])
    )
    renderSettings()
    expect(await screen.findByRole('checkbox', { name: /담당 부서/ })).toBeEnabled()
    expect(screen.getByText(/관리자 목록에만 표시됩니다/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '삭제한 칸' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /칸 이름/ })).toHaveAttribute(
      'href',
      '/admin/boards/b1/fields'
    )
  })
  it('보기 전용에서는 변경할 수 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    get.mockImplementation(() => ok([field()]))
    renderSettings()
    const input = await screen.findByRole('checkbox', { name: '담당 부서' })
    expect(input).toBeDisabled()
    await userEvent.click(input)
    expect(patch).not.toHaveBeenCalled()
  })
  it('조회 실패를 안내하고 재시도로 복구한다', async () => {
    get.mockRejectedValueOnce(new Error('failed')).mockImplementation(() => ok([field()]))
    renderSettings()
    expect(await screen.findByRole('alert')).toHaveTextContent('칸 정보를 불러오지 못했습니다.')
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('checkbox', { name: '담당 부서' })).toBeInTheDocument()
  })
  it('필드가 없으면 추가 안내와 설정 링크를 보여 준다', async () => {
    get.mockImplementation(() => ok([]))
    renderSettings()
    expect(await screen.findByText('추가한 칸이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
