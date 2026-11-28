import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { ContentListForm } from '@/components/content/forms/ContentListForm'
import { getFormForType } from '@/components/content/forms'
import type { Section } from '@/hooks/useSections'

// 테마형 콘텐츠 연결 섹션 (T-258, 콘텐츠 관리 기획서 5장)

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))

const contentType = (id: string, name: string) => ({
  id,
  type_key: id,
  name,
  description: '',
  preset_key: null,
  display_order: 0,
  fields: [],
  item_count: 0,
  published_count: 0,
  updated_at: '2026-11-28T00:00:00Z',
  deleted_at: null,
})

const TYPES = {
  enabled: true,
  types: [contentType('t-faq', 'FAQ'), contentType('t-team', '의료진')],
  trash: [],
  limits: { plan: 'STANDARD', limit: 10, used: 2, can_create: true, reason: null },
  presets: [],
}
const CATEGORIES: Record<string, unknown[]> = {
  't-faq': [
    {
      id: 'c1',
      name: '진료',
      parent_id: null,
      display_order: 0,
      item_count: 1,
      children: [
        { id: 'c2', name: '예약', parent_id: 'c1', display_order: 0, item_count: 0, children: [] },
      ],
    },
  ],
  't-team': [],
}
const TAGS = [{ id: 'g1', name: '주차', item_count: 2 }]

const setting = (field_key: string, field_value: string) => ({
  id: field_key,
  field_key,
  field_value,
  value_type: 'STRING',
  is_sample: false,
})

const section = (settings: ReturnType<typeof setting>[]) =>
  ({ id: 's1', section_type: 'CONTENT_LIST', label: '콘텐츠', settings }) as unknown as Section

beforeEach(() => {
  get.mockReset()
  get.mockImplementation((url: string) => {
    const match = url.match(/types\/([^/]+)\/categories/)
    if (match) return Promise.resolve({ data: { data: CATEGORIES[match[1]] ?? [] } })
    if (url.endsWith('/tags')) return Promise.resolve({ data: { data: TAGS } })
    return Promise.resolve({ data: { data: TYPES } })
  })
})

const renderForm = (settings: ReturnType<typeof setting>[], onSubmit = vi.fn()) =>
  renderWithQuery(
    <MemoryRouter>
      <ContentListForm section={section(settings)} isSaving={false} onSubmit={onSubmit} />
    </MemoryRouter>
  )

describe('ContentListForm', () => {
  it('CONTENT_LIST 섹션은 콘텐츠 연결 폼을 쓴다', () => {
    expect(getFormForType('CONTENT_LIST')).toBe(ContentListForm)
  })

  it('유형 · 카테고리 · 태그 · 방식 · 정렬 · 개수를 저장한다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm([setting('section_title', '자주 묻는 질문')], onSubmit)
    await screen.findByRole('option', { name: '의료진' })
    await user.selectOptions(screen.getByLabelText('보여 줄 콘텐츠 유형'), 't-faq')
    await screen.findByRole('option', { name: '진료 › 예약' })
    await user.selectOptions(screen.getByLabelText('카테고리'), 'c2')
    await user.selectOptions(screen.getByLabelText('태그'), 'g1')
    await user.selectOptions(screen.getByLabelText('보여 주는 방식'), 'FAQ')
    await user.selectOptions(screen.getByLabelText('정렬'), 'latest')
    await user.selectOptions(screen.getByLabelText('개수'), '12')
    await user.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const values = Object.fromEntries(
      (onSubmit.mock.calls[0][0] as { field_key: string; field_value: string }[]).map((s) => [
        s.field_key,
        s.field_value,
      ])
    )
    expect(values).toEqual({
      section_title: '자주 묻는 질문',
      content_type: 't-faq',
      category_id: 'c2',
      tag_id: 'g1',
      item_count: '12',
      display_mode: 'FAQ',
      sort: 'latest',
      empty_text: '',
    })
  })

  it('유형을 바꾸면 카테고리를 비운다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderForm([setting('content_type', 't-faq'), setting('category_id', 'c1')], onSubmit)
    await screen.findByRole('option', { name: '진료' })
    expect(screen.getByLabelText('카테고리')).toHaveValue('c1')
    await user.selectOptions(screen.getByLabelText('보여 줄 콘텐츠 유형'), 't-team')
    await user.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const sent = onSubmit.mock.calls[0][0] as { field_key: string; field_value: string }[]
    expect(sent.find((s) => s.field_key === 'category_id')?.field_value).toBe('')
  })

  it('지운 유형이 연결돼 있으면 다시 고르라고 알린다', async () => {
    renderForm([setting('content_type', 't-gone')])
    expect(await screen.findByText(/연결된 유형이 없어요/)).toBeInTheDocument()
  })
})
