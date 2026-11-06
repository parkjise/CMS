import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { BoardField } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { PostsOverviewPage } from '@/pages/PostsOverviewPage'
import { useAuthStore } from '@/stores/authStore'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get } }))

const field = (key: string, extra: Partial<BoardField> = {}): BoardField => ({
  id: key,
  board_id: 'b1',
  field_key: key,
  label: key,
  field_type: 'TEXT',
  is_required: false,
  is_visible: true,
  help_text: '',
  placeholder: '',
  default_value: null,
  options: [],
  min: null,
  max: null,
  show_in_list: true,
  display_order: 0,
  deleted_at: null,
  value_count: 1,
  ...extra,
})
const row = (id: string, boardId = 'b1', values: Record<string, unknown> = {}) => ({
  id,
  board_id: boardId,
  board_name: boardId,
  title: `글 ${id}`,
  status: 'PUBLISHED',
  is_pinned: false,
  published_at: null,
  created_at: '2026-11-07T00:00:00Z',
  updated_at: '2026-11-07T00:00:00Z',
  deleted_at: null,
  custom_data: values,
})
const ok = (data: unknown) => Promise.resolve({ data: { data } })
const mockApi = (items: ReturnType<typeof row>[], fields: Record<string, BoardField[]> = {}) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards')
      return ok([
        { id: 'b1', name: 'b1', system_key: null },
        { id: 'b2', name: 'b2', system_key: null },
      ])
    if (url === '/v1/posts') return ok({ total: items.length, items, page: 1, size: 20 })
    const boardId = url.match(/^\/v1\/boards\/([^/]+)\/fields$/)?.[1]
    if (boardId) return ok(fields[boardId] ?? [])
    return ok([])
  })
}
const renderPage = () =>
  renderWithQuery(
    <MemoryRouter>
      <PostsOverviewPage />
    </MemoryRouter>
  )
const fieldCalls = () => get.mock.calls.filter(([url]) => String(url).endsWith('/fields'))

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('전체 글 사용자 필드', () => {
  it('같은 키라도 각 글이 속한 게시판의 이름과 선택지를 사용한다', async () => {
    mockApi([row('1', 'b1', { choice: 'v' }), row('2', 'b2', { choice: 'v' })], {
      b1: [
        field('choice', {
          label: '담당',
          field_type: 'SELECT',
          options: [{ value: 'v', label: '운영팀' }],
        }),
      ],
      b2: [
        field('choice', {
          board_id: 'b2',
          label: '분류',
          field_type: 'SELECT',
          options: [{ value: 'v', label: '자료' }],
        }),
      ],
    })
    renderPage()
    expect(await screen.findByText('운영팀')).toBeInTheDocument()
    const first = screen.getByRole('link', { name: '글 1' }).closest('li')!
    const second = screen.getByRole('link', { name: '글 2' }).closest('li')!
    expect(await within(second).findByText('자료')).toBeInTheDocument()
    expect(within(first).getByText('담당:')).toBeInTheDocument()
    expect(within(first).queryByText('자료')).not.toBeInTheDocument()
    expect(within(second).getByText('분류:')).toBeInTheDocument()
  })

  it('표시 해제 · 삭제 · 정의 없는 값과 빈 값은 숨기고 홈페이지 비표시 칸은 관리자에서 보여 준다', async () => {
    mockApi(
      [
        row('1', 'b1', {
          off: '숨길 값',
          removed: '지운 값',
          orphan: '정의 없음',
          blank: '  ',
          empty: [],
          admin: '내부 메모',
        }),
      ],
      {
        b1: [
          field('off', { show_in_list: false }),
          field('removed', { deleted_at: '2026-11-07' }),
          field('blank'),
          field('empty'),
          field('admin', { is_visible: false }),
        ],
      }
    )
    renderPage()
    expect(await screen.findByText('내부 메모')).toBeInTheDocument()
    for (const value of ['숨길 값', '지운 값', '정의 없음', 'blank:', 'empty:'])
      expect(screen.queryByText(value)).not.toBeInTheDocument()
  })

  it('0 · false · 별점 · 여러 선택지 · 사진을 기존 표시 규칙으로 보여 준다', async () => {
    mockApi(
      [
        row('1', 'b1', {
          count: 0,
          enabled: false,
          rating: 3,
          tags: ['a', 'b'],
          photo: 'https://example.test/photo.jpg',
        }),
      ],
      {
        b1: [
          field('count', { field_type: 'NUMBER' }),
          field('enabled', { field_type: 'BOOLEAN' }),
          field('rating', { field_type: 'RATING' }),
          field('tags', {
            field_type: 'MULTI_SELECT',
            options: [
              { value: 'a', label: '기획' },
              { value: 'b', label: '개발' },
            ],
          }),
          field('photo', { field_type: 'IMAGE' }),
        ],
      }
    )
    renderPage()
    for (const value of ['0', '아니오', '★3', '기획, 개발', '사진 있음'])
      expect(await screen.findByText(value)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('여러 글은 게시판당 한 번 조회하고 값 없는 글은 조회하지 않는다', async () => {
    mockApi(
      [
        row('1', 'b1', { name: '첫 값' }),
        row('2', 'b1', { name: '둘째 값' }),
        row('3', 'b2', { name: null }),
      ],
      { b1: [field('name')] }
    )
    renderPage()
    expect(await screen.findByText('첫 값')).toBeInTheDocument()
    expect(await screen.findByText('둘째 값')).toBeInTheDocument()
    expect(fieldCalls()).toHaveLength(1)
    expect(fieldCalls()[0][0]).toBe('/v1/boards/b1/fields')
  })

  it('로딩 중에도 글 링크는 유지하고 정의가 도착한 뒤 값을 표시한다', async () => {
    mockApi([row('1', 'b1', { name: '나중 값' })])
    const original = get.getMockImplementation()!
    let resolve!: (value: unknown) => void
    get.mockImplementation((url: string) =>
      url.endsWith('/fields')
        ? new Promise((done) => {
            resolve = done
          })
        : original(url)
    )
    renderPage()
    expect(await screen.findByText('칸 정보를 불러오는 중…')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '글 1' })).toBeInTheDocument()
    expect(screen.queryByText('나중 값')).not.toBeInTheDocument()
    await act(async () => resolve({ data: { data: [field('name')] } }))
    expect(await screen.findByText('나중 값')).toBeInTheDocument()
  })

  it('필드 조회 실패 시 값을 노출하지 않고 다시 시도할 수 있다', async () => {
    mockApi([row('1', 'b1', { name: '복구 값' })], { b1: [field('name')] })
    const original = get.getMockImplementation()!
    let fail = true
    get.mockImplementation((url: string) =>
      url.endsWith('/fields') && fail ? Promise.reject(new Error('failed')) : original(url)
    )
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('칸 정보를 불러오지 못했습니다.')
    expect(screen.queryByText('복구 값')).not.toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('복구 값')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('보기 전용도 값을 읽을 수 있고 쓰기 작업은 생기지 않는다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    mockApi([row('1', 'b1', { name: '조회 값' })], { b1: [field('name')] })
    renderPage()
    expect(await screen.findByText('조회 값')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('휴지통 글에도 현재 필드 정의를 적용하고 수정 링크는 숨긴다', async () => {
    mockApi([row('1', 'b1', { name: '보관 값' })], { b1: [field('name')] })
    renderPage()
    expect(await screen.findByText('보관 값')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '휴지통 보기' }))
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '글 1' })).not.toBeInTheDocument()
    )
    expect(screen.getByText('보관 값')).toBeInTheDocument()
  })
})
