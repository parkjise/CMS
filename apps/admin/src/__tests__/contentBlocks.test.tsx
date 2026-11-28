import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { AddSectionModal } from '@/components/content/AddSectionModal'
import { SectionBlockBar } from '@/components/contents/SectionBlockBar'
import type { ContentBlock } from '@/hooks/useContentBlocks'
import type { Section, SectionLimits } from '@/hooks/useSections'
import { ContentBlocksPage } from '@/pages/ContentBlocksPage'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'

// 공통 블록 (T-260, 콘텐츠 관리 기획서 CM-04)

const { get, post, del, toastSuccess } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ api: { get, post, delete: del } }))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: vi.fn() } }
})

const block = (id: string, over: Partial<ContentBlock> = {}): ContentBlock => ({
  id,
  name: `블록 ${id}`,
  section_type: 'INTRO',
  type_label: '소개',
  usage: [],
  updated_at: '2026-11-28T00:00:00Z',
  ...over,
})

let blocks: ContentBlock[]

const section = (over: Partial<Section> = {}): Section =>
  ({
    id: 's1',
    tenant_id: 't',
    section_type: 'INTRO',
    label: '인사말',
    display_order: 0,
    is_active: true,
    page_key: 'home',
    block_id: null,
    settings: [],
    created_at: '',
    updated_at: '',
    ...over,
  }) as Section

const limits: SectionLimits = {
  plan_type: 'STANDARD',
  count: 1,
  limit: 10,
  can_add: true,
  can_delete: true,
  reason: null,
  addable_types: [
    { section_type: 'HERO_BANNER', label: '메인 배너' },
    { section_type: 'INTRO', label: '소개' },
  ],
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  del.mockReset()
  toastSuccess.mockReset()
  blocks = [
    block('b1', {
      name: '인사말 블록',
      usage: [
        { section_id: 's1', label: '인사말', page_key: 'home', is_active: true },
        { section_id: 's2', label: '인사말', page_key: 'about', is_active: true },
      ],
    }),
    block('b2', { name: 'FAQ 블록', section_type: 'FAQ', type_label: 'FAQ' }),
  ]
  get.mockImplementation(() => Promise.resolve({ data: { data: blocks } }))
  post.mockResolvedValue({ data: { data: { section_id: 'new' } } })
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  useFeatureStore.setState({ loaded: true, flags: { CONTENT_MANAGE: true } } as never)
})
afterEach(() => useFeatureStore.getState().reset())

const wrap = (ui: React.ReactNode) => renderWithQuery(<MemoryRouter>{ui}</MemoryRouter>)

describe('SectionBlockBar', () => {
  it('이어진 섹션은 다른 곳 수를 알리고 연결을 끊는다', async () => {
    const user = userEvent.setup()
    wrap(<SectionBlockBar section={section({ block_id: 'b1' })} />)
    expect(await screen.findByText(/다른 1곳에서도 쓰고 있어요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '연결 끊고 이 섹션만 고치기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/contents/blocks/unlink', { section_id: 's1' })
    )
  })

  it('이어지지 않은 섹션은 블록으로 저장한다', async () => {
    const user = userEvent.setup()
    wrap(<SectionBlockBar section={section()} />)
    await user.click(screen.getByRole('button', { name: '공통 블록으로 저장' }))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('블록 이름')
    expect(name).toHaveValue('인사말')
    await user.clear(name)
    await user.type(name, '공통 인사')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/contents/blocks', {
        section_id: 's1',
        name: '공통 인사',
      })
    )
  })

  it('스위치가 꺼져 있으면 아무것도 없다', () => {
    useFeatureStore.setState({ loaded: true, flags: {} } as never)
    wrap(<SectionBlockBar section={section()} />)
    expect(screen.queryByRole('button', { name: '공통 블록으로 저장' })).not.toBeInTheDocument()
  })
})

describe('AddSectionModal — 공통 블록에서', () => {
  it('그릴 수 있는 종류의 블록만 보이고, 고른 방식으로 더한다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    wrap(<AddSectionModal open limits={limits} pageKey="about" onClose={onClose} />)
    const block1 = await screen.findByRole('radio', { name: /인사말 블록/ })
    expect(screen.queryByRole('radio', { name: /FAQ 블록/ })).not.toBeInTheDocument()
    await user.click(block1)
    expect(screen.queryByLabelText('섹션 이름 (선택)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /복사해서 쓰기/ }))
    await user.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/contents/blocks/b1/sections', {
        page_key: 'about',
        mode: 'copy',
      })
    )
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ContentBlocksPage', () => {
  it('쓰는 곳을 보여 주고, 쓰는 블록은 지우기 대신 안내한다', async () => {
    const user = userEvent.setup()
    wrap(<ContentBlocksPage />)
    const used = await screen.findByRole('list', { name: '인사말 블록 쓰는 곳' })
    expect(within(used).getAllByRole('link')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '인사말 블록 지우기' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/2곳에서 쓰고 있어요/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '지우기' })).not.toBeInTheDocument()
  })

  it('쓰지 않는 블록은 지운다', async () => {
    const user = userEvent.setup()
    del.mockResolvedValue({ data: { data: null } })
    wrap(<ContentBlocksPage />)
    await user.click(await screen.findByRole('button', { name: 'FAQ 블록 지우기' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/contents/blocks/b2'))
  })
})
