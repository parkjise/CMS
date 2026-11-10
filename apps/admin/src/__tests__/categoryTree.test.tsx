import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { BoardCategory } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { categoryLabel, moveAmongSiblings, orderTree } from '@/lib/categoryTree'
import { BoardCategoriesPage } from '@/pages/BoardCategoriesPage'
import { useAuthStore } from '@/stores/authStore'

/** 카테고리 2단계 (T-179) */

const { get, post, patch, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get, post, patch, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const cat = (
  id: string,
  name: string,
  display_order: number,
  parent_id: string | null = null,
): BoardCategory => ({
  id,
  board_id: 'b1',
  name,
  is_active: true,
  display_order,
  post_count: 0,
  parent_id,
})

// 서버 순서 그대로 — 하위가 상위보다 앞에 와도 트리로 펼친다
const care = cat('p1', '진료', 0)
const consult = cat('p2', '상담', 2)
const implant = cat('k1', '임플란트', 1, 'p1')
const ortho = cat('k2', '교정', 3, 'p1')
const all = [care, implant, consult, ortho]

describe('categoryTree', () => {
  it('상위 바로 뒤에 그 하위를 둔다', () => {
    expect(orderTree([implant, consult, care, ortho]).map((c) => c.id)).toEqual([
      'p2',
      'p1',
      'k1',
      'k2',
    ])
    expect(orderTree(all).map((c) => c.id)).toEqual(['p1', 'k1', 'k2', 'p2'])
  })

  it('상위가 목록에 없는 분류는 1단계로 본다', () => {
    const orphan = cat('o', '고아', 5, 'gone')
    expect(orderTree([orphan, care]).map((c) => c.id)).toEqual(['o', 'p1'])
    expect(categoryLabel(orphan, [orphan, care])).toBe('고아')
  })

  it('하위는 `상위 › 하위` 로 부른다', () => {
    expect(categoryLabel(implant, all)).toBe('진료 › 임플란트')
    expect(categoryLabel(care, all)).toBe('진료')
  })

  it('형제끼리만 자리를 바꾼다', () => {
    const tree = orderTree(all)
    expect(moveAmongSiblings(tree, 'k2', 'k1')?.map((c) => c.id)).toEqual(['p1', 'k2', 'k1', 'p2'])
    // 상위를 옮기면 하위도 따라간다
    expect(moveAmongSiblings(tree, 'p2', 'p1')?.map((c) => c.id)).toEqual(['p2', 'p1', 'k1', 'k2'])
    expect(moveAmongSiblings(tree, 'k1', 'p2')).toBeNull()
  })
})

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = (categories: BoardCategory[]) =>
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards') return ok([{ id: 'b1', name: '진료 안내', system_key: null }])
    if (url.endsWith('/categories')) return ok(categories)
    return ok([])
  })

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={['/admin/boards/b1/categories']}>
      <Routes>
        <Route path="/admin/boards/:boardId/categories" element={<BoardCategoriesPage />} />
      </Routes>
    </MemoryRouter>,
  )

const list = () => screen.findByRole('list', { name: '카테고리 목록' })

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('카테고리 탭 — 2단계', () => {
  it('상위 아래에 하위를 들여 보여 준다', async () => {
    mockApi(all)
    renderPage()
    const rows = within(await list()).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('p')?.textContent?.replace('↳', ''))).toEqual([
      '진료',
      '임플란트',
      '교정',
      '상담',
    ])
    expect(rows[1]).toHaveClass('pl-10')
    expect(within(rows[0]).getByText(/하위 2개/)).toBeInTheDocument()
  })

  it('상위를 골라 추가한다 — 상위 후보는 1단계만', async () => {
    mockApi(all)
    post.mockResolvedValue({ data: { data: cat('k3', '미백', 4, 'p1') } })
    renderPage()
    await list()
    const parentSelect = screen.getByLabelText('상위 카테고리')
    expect(within(parentSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '없음 (1단계)',
      '진료',
      '상담',
    ])
    await userEvent.type(screen.getByLabelText('새 카테고리'), '미백')
    await userEvent.selectOptions(parentSelect, 'p1')
    await userEvent.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards/b1/categories', { name: '미백', parent_id: 'p1' }),
    )
  })

  it('수정에서 상위를 바꾸거나 1단계로 되돌린다', async () => {
    mockApi(all)
    patch.mockResolvedValue({ data: { data: implant } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '임플란트 이름 바꾸기' }))
    const row = screen.getByLabelText('카테고리 이름').closest('form') as HTMLElement
    await userEvent.selectOptions(within(row).getByLabelText('상위 카테고리'), 'p2')
    await userEvent.click(within(row).getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/k1', { parent_id: 'p2' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: '교정 이름 바꾸기' }))
    const form = screen.getByLabelText('카테고리 이름').closest('form') as HTMLElement
    await userEvent.selectOptions(within(form).getByLabelText('상위 카테고리'), '')
    await userEvent.click(within(form).getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/k2', { parent_id: null }),
    )
  })

  it('하위가 있으면 상위 변경 · 합치기 · 삭제를 막는다', async () => {
    mockApi(all)
    renderPage()
    expect(await screen.findByRole('button', { name: '진료 합치기' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '진료 이름 바꾸기' }))
    const form = screen.getByLabelText('카테고리 이름').closest('form') as HTMLElement
    expect(within(form).getByLabelText('상위 카테고리')).toBeDisabled()
    expect(within(form).getByText(/하위 카테고리가 있어/)).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: '취소' }))
    await userEvent.click(screen.getByRole('button', { name: '진료 삭제' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/임플란트, 교정/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()
  })

  it('위아래 버튼은 형제 안에서만 움직이고 전체 순서를 보낸다', async () => {
    mockApi(all)
    patch.mockResolvedValue({ data: { data: [] } })
    renderPage()
    // 첫 하위는 위로 갈 수 없다 — 상위를 넘지 않는다
    expect(await screen.findByRole('button', { name: '임플란트 위로' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '교정 아래로' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '교정 위로' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/categories/order', {
        category_ids: ['p1', 'k2', 'k1', 'p2'],
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: '상담 위로' }))
    await waitFor(() =>
      expect(patch).toHaveBeenLastCalledWith('/v1/boards/b1/categories/order', {
        category_ids: ['p2', 'p1', 'k2', 'k1'],
      }),
    )
  })

  it('삭제할 때 옮길 곳은 `상위 › 하위` 로 보인다', async () => {
    mockApi([...all, { ...cat('x', '기타', 9), post_count: 1 }])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: '기타 삭제' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('option', { name: '진료 › 임플란트' })).toBeInTheDocument()
  })
})
