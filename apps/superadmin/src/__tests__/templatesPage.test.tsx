import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SuperTemplate } from '@/hooks/useTemplates'

const useSuperTemplates = vi.fn()
const update = vi.fn()
const create = vi.fn()
vi.mock('@/hooks/useTemplates', () => ({
  useSuperTemplates: () => useSuperTemplates(),
  useUpdateTemplate: () => ({ mutateAsync: update, isPending: false }),
  useCreateTemplate: () => ({ mutateAsync: create, isPending: false }),
}))

import { TemplatesPage } from '@/pages/TemplatesPage'

const tpl = (over: Partial<SuperTemplate> & { id: string; name: string }): SuperTemplate => ({
  template_type: 'GENERAL',
  code: null,
  renderer: 'theme',
  version: '1.0.0',
  description: null,
  thumbnail_url: null,
  css_variables: { primary: '#2563eb', background: '#ffffff' },
  is_active: true,
  min_plan: 'BASIC',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  usage_count: 0,
  ...over,
})

const DATA = [
  tpl({ id: 't1', name: '모던 미니멀', template_type: 'STARTUP', usage_count: 3 }),
  tpl({
    id: 't2',
    name: '병원 A',
    template_type: 'HOSPITAL',
    renderer: 'code',
    code: 'TPL_HOSPITAL_A',
    min_plan: 'STANDARD',
    is_active: false,
  }),
]

describe('템플릿 관리 (T-208)', () => {
  beforeEach(() => {
    useSuperTemplates.mockReturnValue({ data: DATA, isLoading: false, isError: false })
    update.mockReset().mockResolvedValue({})
    create.mockReset().mockResolvedValue({})
  })
  afterEach(() => vi.restoreAllMocks())

  it('업종 · 방식 · 플랜 · 쓰는 사업체 · 공개를 보여 준다', () => {
    render(<TemplatesPage />)
    const [, first, second] = screen.getAllByRole('row')
    const a = within(first)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(a).toEqual(expect.arrayContaining(['스타트업', '테마형', 'BASIC', '3', '공개']))
    const b = within(second)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(b).toEqual(
      expect.arrayContaining(['병원', '코드형 · TPL_HOSPITAL_A', 'STANDARD', '0', '숨김'])
    )
  })

  it('쓰는 사업체가 있는 템플릿을 숨기면 확인 후 숨긴다', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TemplatesPage />)
    await user.click(screen.getByRole('button', { name: '모던 미니멀 숨기기' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('3곳의 홈페이지는 그대로'))
    expect(update).toHaveBeenCalledWith({ id: 't1', input: { is_active: false } })
  })

  it('확인을 취소하면 숨기지 않고, 숨긴 템플릿은 확인 없이 공개', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TemplatesPage />)
    await user.click(screen.getByRole('button', { name: '모던 미니멀 숨기기' }))
    expect(update).not.toHaveBeenCalled()
    confirm.mockClear()
    await user.click(screen.getByRole('button', { name: '병원 A 공개하기' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ id: 't2', input: { is_active: true } })
  })

  it('새 테마형 템플릿 — 가져온 색을 고쳐 숨김으로 만든다', async () => {
    const user = userEvent.setup()
    render(<TemplatesPage />)
    await user.click(screen.getByRole('button', { name: /새 테마형 템플릿/ }))
    await user.type(screen.getByLabelText('이름'), '봄 테마')
    await user.selectOptions(screen.getByLabelText('추천 업종'), 'PENSION')
    // 테마형만 가져올 수 있다
    expect(
      within(screen.getByLabelText('가져올 템플릿'))
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['모던 미니멀'])
    const primary = screen.getByLabelText('primary 값')
    await user.clear(primary)
    await user.type(primary, '#ff8800')
    await user.click(screen.getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({
      name: '봄 테마',
      template_type: 'PENSION',
      base_template_id: 't1',
      css_variables: { primary: '#ff8800', background: '#ffffff' },
      is_active: false,
    })
  })

  it('코드형은 색 · 글꼴 없이 이름 · 플랜만 고친다', async () => {
    const user = userEvent.setup()
    render(<TemplatesPage />)
    await user.click(screen.getByRole('button', { name: '병원 A 수정' }))
    expect(screen.queryByLabelText('primary 값')).not.toBeInTheDocument()
    expect(screen.getByText(/템플릿 코드에서 바꿔요/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('최소 플랜'), 'PREMIUM')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    const input = update.mock.calls[0][0].input
    expect(input).toMatchObject({ name: '병원 A', min_plan: 'PREMIUM' })
    expect(input).not.toHaveProperty('css_variables')
  })
})
