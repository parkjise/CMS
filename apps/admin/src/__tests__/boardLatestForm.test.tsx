import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { BoardLatestForm } from '@/components/content/forms/BoardLatestForm'
import { GenericForm } from '@/components/content/forms/GenericForm'
import { getFormForType } from '@/components/content/forms'
import type { Section } from '@/hooks/useSections'

// 메인 화면 최신 글 — 게시판 · 개수 고르기 (T-185)
// 테마형 게시판 연결 (T-243) — 보여 주는 방식 · 분류 · 정렬 · 빈 결과 문구

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))

const board = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  system_key: null,
  status: 'ACTIVE',
  deleted_at: null,
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  ...extra,
})

const BOARDS = [
  board('b1', '병원 소식'),
  board('b2', '채용 공고', { status: 'INACTIVE' }),
  board('b3', '회원 소식', { permissions: { read: 'MEMBER', write: 'ADMIN' } }),
  board('n1', '공지사항', { system_key: 'notice' }),
  board('r1', '상담', { system_key: 'reviews' }),
]

const setting = (field_key: string, field_value: string, value_type = 'STRING') => ({
  id: field_key,
  field_key,
  field_value,
  value_type,
  is_sample: false,
})

const section = (section_type: string, settings: ReturnType<typeof setting>[]) =>
  ({ id: 's1', section_type, label: '최신', settings }) as unknown as Section

const CATEGORIES = [
  { id: 'c1', board_id: 'b1', name: '진료', is_active: true, display_order: 0, post_count: 2 },
  { id: 'c2', board_id: 'b1', name: '임플란트', is_active: true, display_order: 1, post_count: 1, parent_id: 'c1' },
]

beforeEach(() => {
  get.mockReset()
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: { data: url.endsWith('/categories') ? CATEGORIES : BOARDS } }),
  )
})

describe('BoardLatestForm', () => {
  it('BOARD_LATEST 섹션은 최신 글 폼을 쓴다', () => {
    expect(getFormForType('BOARD_LATEST')).toBe(BoardLatestForm)
  })

  it('고를 수 있는 게시판만 보이고, 고른 게시판 · 개수 · 제목을 저장한다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithQuery(
      <BoardLatestForm
        section={section('BOARD_LATEST', [setting('section_title', '최신 글')])}
        isSaving={false}
        onSubmit={onSubmit}
      />,
    )
    const select = await screen.findByLabelText('보여 줄 게시판')
    await waitFor(() => expect(select).toBeEnabled())
    const names = Array.from((select as HTMLSelectElement).options).map((o) => o.text)
    // 회원만 읽기 · 공지 아닌 기본 게시판은 뺀다
    expect(names).toEqual(['선택하세요', '병원 소식', '채용 공고 (비활성)', '공지사항'])
    expect(screen.getByLabelText('글 개수')).toHaveValue('5')

    await user.selectOptions(select, 'b1')
    await user.selectOptions(screen.getByLabelText('글 개수'), '3')
    await user.clear(screen.getByLabelText('섹션 제목'))
    await user.type(screen.getByLabelText('섹션 제목'), '병원 소식')
    await user.click(screen.getByRole('button', { name: /저장/ }))

    expect(onSubmit).toHaveBeenCalledWith([
      { field_key: 'section_title', field_value: '병원 소식', value_type: 'STRING' },
      { field_key: 'latest_board', field_value: 'b1', value_type: 'STRING' },
      { field_key: 'post_count', field_value: '3', value_type: 'STRING' },
      { field_key: 'display_mode', field_value: 'LIST', value_type: 'STRING' },
      { field_key: 'sort', field_value: 'latest', value_type: 'STRING' },
      { field_key: 'category_id', field_value: '', value_type: 'STRING' },
      { field_key: 'empty_text', field_value: '', value_type: 'STRING' },
    ])
  })

  it('보여 주는 방식 · 분류 · 정렬 · 12개 · 빈 결과 문구를 함께 저장한다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithQuery(
      <BoardLatestForm
        section={section('BOARD_LATEST', [setting('latest_board', 'b1')])}
        isSaving={false}
        onSubmit={onSubmit}
      />,
    )
    const category = await screen.findByLabelText('분류')
    await waitFor(() => expect(category).toBeEnabled())
    expect(Array.from((category as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      '전체',
      '진료',
      '└ 임플란트',
    ])
    await user.selectOptions(screen.getByLabelText('보여 주는 방식'), 'CARD')
    expect(screen.getByText(/대표 사진 · 제목 · 요약/)).toBeInTheDocument()
    await user.selectOptions(category, 'c2')
    await user.selectOptions(screen.getByLabelText('정렬'), 'board')
    await user.selectOptions(screen.getByLabelText('글 개수'), '12')
    await user.type(screen.getByLabelText('글이 없을 때 문구'), '준비 중이에요')
    await user.click(screen.getByRole('button', { name: /저장/ }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        { field_key: 'post_count', field_value: '12', value_type: 'STRING' },
        { field_key: 'display_mode', field_value: 'CARD', value_type: 'STRING' },
        { field_key: 'sort', field_value: 'board', value_type: 'STRING' },
        { field_key: 'category_id', field_value: 'c2', value_type: 'STRING' },
        { field_key: 'empty_text', field_value: '준비 중이에요', value_type: 'STRING' },
      ]),
    )
  })

  it('게시판을 바꾸면 고른 분류를 비운다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithQuery(
      <BoardLatestForm
        section={section('BOARD_LATEST', [
          setting('latest_board', 'b1'),
          setting('category_id', 'c1'),
        ])}
        isSaving={false}
        onSubmit={onSubmit}
      />,
    )
    await waitFor(() => expect(screen.getByLabelText('분류')).toHaveValue('c1'))
    await user.selectOptions(screen.getByLabelText('보여 줄 게시판'), 'n1')
    await user.click(screen.getByRole('button', { name: /저장/ }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([{ field_key: 'category_id', field_value: '', value_type: 'STRING' }]),
    )
  })

  it('빈 결과 문구가 100자를 넘으면 저장을 막는다', async () => {
    const user = userEvent.setup()
    renderWithQuery(
      <BoardLatestForm section={section('BOARD_LATEST', [])} isSaving={false} onSubmit={vi.fn()} />,
    )
    await user.click(screen.getByLabelText('글이 없을 때 문구'))
    await user.paste('가'.repeat(101))
    expect(screen.getByText('100자 이하로 적어 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /저장/ })).toBeDisabled()
  })

  it('지웠거나 회원 전용이 된 게시판이면 다시 고르라고 알린다', async () => {
    renderWithQuery(
      <BoardLatestForm
        section={section('BOARD_LATEST', [setting('latest_board', 'b3')])}
        isSaving={false}
        onSubmit={vi.fn()}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('다시 골라 주세요')
    expect(screen.getByLabelText('보여 줄 게시판')).toHaveValue('')
  })
})

describe('GenericForm — 코드형 최신 공지', () => {
  it('기본은 공지, 다른 게시판을 고르면 함께 저장한다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithQuery(
      <GenericForm
        section={section('NOTICE_LATEST', [
          setting('title', 'NOTICE'),
          setting('items', '[]', 'JSON'),
          setting('post_count', '6'),
        ])}
        isSaving={false}
        onSubmit={onSubmit}
      />,
    )
    const select = await screen.findByLabelText('보여 줄 게시판')
    await waitFor(() => expect(select).toBeEnabled())
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: '공지사항 (기본)' })).toBeInTheDocument()
    expect(screen.getByLabelText('글 개수')).toHaveValue('6')
    // 게시판 · 개수는 글자 칸으로 다시 나오지 않는다
    expect(screen.queryByRole('textbox', { name: /post_count|글 개수/ })).toBeNull()

    await user.selectOptions(select, 'b1')
    await user.click(screen.getByRole('button', { name: /저장/ }))
    expect(onSubmit).toHaveBeenCalledWith([
      { field_key: 'title', field_value: 'NOTICE', value_type: 'STRING' },
      { field_key: 'latest_board', field_value: 'b1', value_type: 'STRING' },
      { field_key: 'post_count', field_value: '6', value_type: 'STRING' },
    ])
  })
})
