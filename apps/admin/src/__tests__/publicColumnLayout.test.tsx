import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardColumnLayout, BoardField } from '@cms/types'
import { PublicColumnLayoutSettings } from '@/components/boards/PublicColumnLayoutSettings'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/hooks/useBoardFields', () => ({ useBoardFields: query }))
const field = (key: string, extra = {}): BoardField => ({
  id: key,
  value_count: 0,
  board_id: 'b1',
  field_key: key,
  label: key,
  field_type: 'TEXT',
  display_order: 0,
  is_visible: true,
  show_in_list: true,
  deleted_at: null,
  is_required: false,
  help_text: '',
  placeholder: '',
  default_value: null,
  options: [],
  min: null,
  max: null,
  ...extra,
})
const fields = [
  field('first'),
  field('second', { display_order: 1 }),
  field('hidden', { is_visible: false }),
  field('off', { show_in_list: false }),
  field('deleted', { deleted_at: '2026-11-09' }),
  field('foreign', { board_id: 'b2' }),
]
function Form({
  initial = [],
  disabled = false,
}: {
  initial?: BoardColumnLayout[]
  disabled?: boolean
}) {
  const [layout, setLayout] = useState(initial)
  return (
    <fieldset disabled={disabled}>
      <PublicColumnLayoutSettings boardId="b1" layout={layout} onChange={setLayout} />
      <output data-testid="layout">{JSON.stringify(layout)}</output>
    </fieldset>
  )
}
beforeEach(() =>
  query.mockReturnValue({ data: fields, isPending: false, isError: false, refetch: vi.fn() })
)
describe('홈페이지 표 열 설정', () => {
  it('표시 가능한 같은 게시판 칸만 편집하고 이동·크기·초기화를 처리한다', async () => {
    render(<Form />)
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'first 홈페이지 열 앞으로' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('second 홈페이지 열 크기'), 'wide')
    await userEvent.click(screen.getByRole('button', { name: 'second 홈페이지 열 앞으로' }))
    expect(screen.getByTestId('layout')).toHaveTextContent(
      '[{"key":"second","size":"wide"},{"key":"first","size":"normal"}]'
    )
    await userEvent.click(screen.getByRole('button', { name: '홈페이지 열 설정 초기화' }))
    expect(screen.getByTestId('layout')).toHaveTextContent('[]')
  })
  it('저장된 순서와 크기를 복원하고 새 칸은 기본 크기로 뒤에 붙인다', () => {
    render(
      <Form
        initial={[
          { key: 'hidden', size: 'wide' },
          { key: 'second', size: 'narrow' },
        ]}
      />
    )
    expect(screen.getAllByRole('combobox').map((el) => (el as HTMLSelectElement).value)).toEqual([
      'narrow',
      'normal',
    ])
    expect(screen.getAllByRole('listitem').map((el) => el.textContent?.slice(0, 9))).toEqual([
      expect.stringContaining('second'),
      expect.stringContaining('first'),
    ])
  })
  it('뷰어 필드셋 안의 입력과 이동을 잠근다', () => {
    render(<Form disabled />)
    for (const el of [...screen.getAllByRole('combobox'), ...screen.getAllByRole('button')])
      expect(el).toBeDisabled()
  })
  it('로딩과 조회 실패를 구분하고 재시도한다', async () => {
    query.mockReturnValue({ isPending: true })
    const view = render(<Form />)
    expect(screen.getByText('표시할 칸을 불러오는 중…')).toBeInTheDocument()
    const refetch = vi.fn()
    query.mockReturnValue({ isError: true, refetch })
    view.rerender(<Form />)
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(refetch).toHaveBeenCalled()
  })
  it('표시 칸이 사라지면 원시 설정을 노출하지 않고 안내한다', () => {
    query.mockReturnValue({ data: [] })
    render(<Form initial={[{ key: 'removed', size: 'wide' }]} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText(/홈페이지 표시와 목록 표시를 켠 칸이 없습니다/)).toBeInTheDocument()
  })
})
