import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import type { BoardField } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { useAuthStore } from '@/stores/authStore'
import {
  POST_TABLE_STORAGE_KEY,
  readTableLayouts,
  usePostTableLayoutStore,
} from '@/stores/postTableLayoutStore'

const { get, patch, del, post } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ api: { get, patch, delete: del, post } }))
const ok = (data: unknown) => Promise.resolve({ data: { data } })
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
const row = {
  id: 'p1',
  board_id: 'b1',
  title: '첫 글',
  status: 'PUBLISHED',
  is_pinned: false,
  is_secret: true,
  guest_name: '방문자',
  created_at: '2026-11-08T00:00:00Z',
  published_at: null,
  deleted_at: null as string | null,
  custom_data: {
    note: '내부 메모',
    count: 0,
    flag: false,
    choice: 'v',
    image: '/photo.png',
    url: 'https://example.com',
    blank: ' ',
    off: '숨긴 값',
    deleted: '삭제 값',
    unknown: '정의 없는 값',
  },
}
let fields: BoardField[]
let currentRow: typeof row
const mockApi = (system = false, total = 1) => {
  get.mockImplementation((url: string) => {
    if (url === '/v1/boards')
      return ok([
        { id: 'b1', name: '소식', system_key: system ? 'notice' : null },
        { id: 'b2', name: '다른 게시판', system_key: null },
      ])
    if (url === '/v1/site-settings/menu') return ok({ mode: 'code' })
    if (url === '/v1/boards/b1/fields') return ok(fields)
    if (url === '/v1/boards/b2/fields')
      return ok([field('other', { board_id: 'b2', label: '다른 칸' })])
    if (url.endsWith('/posts')) return ok({ total, items: [currentRow], page: 1, size: 20 })
    return ok([])
  })
  patch.mockImplementation(() => ok(currentRow))
  del.mockImplementation(() => {
    currentRow = { ...currentRow, deleted_at: '2026-11-08' }
    return ok(undefined)
  })
  post.mockImplementation(() => {
    currentRow = { ...currentRow, deleted_at: null }
    return ok(currentRow)
  })
}
const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={['/admin/boards/b1/posts']}>
      <Link to="/admin/boards/b2/posts">다른 게시판 열기</Link>
      <Routes>
        <Route path="/admin/boards/:boardId/posts" element={<BoardPostsPage />} />
      </Routes>
    </MemoryRouter>
  )
const tableMode = async () => {
  const control = await screen.findByRole('combobox', { name: '추가 정보 표시 방식' })
  await waitFor(() => expect(control).toBeEnabled())
  await userEvent.selectOptions(control, 'table')
  await screen.findByRole('table')
}
const params = () =>
  get.mock.calls.filter(([url]) => url === '/v1/boards/b1/posts').at(-1)?.[1].params
beforeEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  localStorage.removeItem(POST_TABLE_STORAGE_KEY)
  usePostTableLayoutStore.setState({ layouts: {}, saveFailed: {} })
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  currentRow = { ...row }
  fields = [
    field('note', { label: '메모', is_visible: false, display_order: 2 }),
    field('count', { label: '수량', field_type: 'NUMBER', display_order: 1 }),
    field('off', { show_in_list: false }),
    field('deleted', { deleted_at: '2026-11-08' }),
    field('foreign', { board_id: 'b2' }),
  ]
  mockApi()
})

describe('게시판별 관리자 글 표 보기', () => {
  it('기본 제목 아래 표시를 유지하며 표시 해제/삭제/다른 게시판/정의 없는 값은 제외한다', async () => {
    renderPage()
    expect(await screen.findByText('내부 메모')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('수량:')).toBeInTheDocument()
    for (const value of ['숨긴 값', '삭제 값', '정의 없는 값', 'foreign:'])
      expect(screen.queryByText(value)).not.toBeInTheDocument()
  })
  it('선택한 칸을 순서대로 열로 표시하고 0/아니오/선택지/사진/URL/빈 값을 안전한 글자로 보여 준다', async () => {
    fields = [
      ...fields,
      field('flag', { field_type: 'BOOLEAN' }),
      field('choice', { field_type: 'SELECT', options: [{ value: 'v', label: '운영팀' }] }),
      field('image', { field_type: 'IMAGE' }),
      field('url', { field_type: 'URL' }),
      field('blank'),
    ]
    renderPage()
    await tableMode()
    const table = screen.getByRole('table', { name: '게시글과 추가 정보' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((el) => el.textContent)
    expect(headers).toEqual([
      '게시글',
      'flag',
      'choice',
      'image',
      'url',
      'blank',
      '수량',
      '메모',
      '작업',
    ])
    const cells = within(table).getAllByRole('cell')
    expect(cells.map((el) => el.textContent)).toEqual(
      expect.arrayContaining([
        '아니오',
        '운영팀',
        '사진 있음',
        'https://example.com',
        '—',
        '0',
        '내부 메모',
      ])
    )
    expect(within(table).queryByText('메모:')).not.toBeInTheDocument()
    expect(within(table).queryByRole('img')).not.toBeInTheDocument()
    expect(
      within(table).queryByRole('link', { name: 'https://example.com' })
    ).not.toBeInTheDocument()
    expect(within(table).getByText('비밀글')).toBeInTheDocument()
    expect(within(table).getByText('비회원 · 방문자')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '글 목록 표' })).toHaveAttribute('tabindex', '0')
  })
  it('표에서도 기존 고정/공개/삭제/복원 요청과 수정 링크를 사용한다', async () => {
    renderPage()
    await tableMode()
    expect(screen.getByRole('link', { name: '첫 글' })).toHaveAttribute(
      'href',
      '/admin/boards/b1/posts/p1/edit'
    )
    await userEvent.click(screen.getByRole('button', { name: '상단 고정' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/posts/p1', { is_pinned: true })
    )
    await userEvent.click(screen.getByRole('button', { name: '비공개로' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/posts/p1', { status: 'PRIVATE' })
    )
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/b1/posts/p1/restore'))
    expect(del).toHaveBeenCalledWith('/v1/boards/b1/posts/p1')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
  it('보기 전용도 보기만 바꿀 수 있고 작업 열/쓰기 버튼은 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderPage()
    await tableMode()
    expect(screen.queryByRole('columnheader', { name: '작업' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument()
    expect(screen.getByText('내부 메모')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })
  it('표 전환/복귀는 조회 조건/페이지와 요청 수를 바꾸지 않는다', async () => {
    mockApi(false, 21)
    renderPage()
    await screen.findByText('내부 메모')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '상태' }), 'PRIVATE')
    fireEvent.change(screen.getByRole('textbox', { name: '제목 검색' }), {
      target: { value: '검색어' },
    })
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await waitFor(() => expect(params()).toMatchObject({ page: 2, status: 'PRIVATE', q: '검색어' }))
    const calls = get.mock.calls.length
    await tableMode()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '추가 정보 표시 방식' }),
      'inline'
    )
    expect(get.mock.calls).toHaveLength(calls)
    expect(params()).toMatchObject({ page: 2, status: 'PRIVATE', q: '검색어' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('필드 조회 중에는 잠그고 실패 시 원시 값을 내지 않으며 재시도할 수 있다', async () => {
    let rejectFields!: (reason: Error) => void
    const pending = new Promise((_, reject) => {
      rejectFields = reject
    })
    const original = get.getMockImplementation()!
    get.mockImplementation((url: string, ...args: unknown[]) =>
      url === '/v1/boards/b1/fields' ? pending : original(url, ...args)
    )
    renderPage()
    expect(await screen.findByText('칸 정보를 불러오는 중…')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '추가 정보 표시 방식' })).toBeDisabled()
    await act(async () => rejectFields(new Error('조회 실패')))
    expect(await screen.findByRole('alert')).toHaveTextContent('칸 정보를 불러오지 못했습니다')
    expect(screen.queryByText('내부 메모')).not.toBeInTheDocument()
    get.mockImplementation(original)
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByText('내부 메모')
    expect(screen.getByRole('combobox', { name: '추가 정보 표시 방식' })).toBeEnabled()
  })
  it('표시할 칸이 없으면 전환을 끄고 기본 게시판에는 표시 방식을 제공하지 않는다', async () => {
    fields = []
    const view = renderPage()
    expect(await screen.findByText('목록 표시를 켠 추가 칸이 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '추가 정보 표시 방식' })).toBeDisabled()
    view.unmount()
    mockApi(true)
    renderPage()
    await screen.findByRole('heading', { name: '소식' })
    expect(screen.queryByRole('combobox', { name: '추가 정보 표시 방식' })).not.toBeInTheDocument()
  })
  it('필드 갱신에서 표시 칸이 사라지면 남은 원시 값을 내지 않고 기본 보기로 돌아간다', async () => {
    renderPage()
    await tableMode()
    fields = []
    await userEvent.click(screen.getByRole('button', { name: '상단 고정' }))
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
    expect(screen.queryByText('내부 메모')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '추가 정보 표시 방식' })).toBeDisabled()
  })
  it('다른 게시판으로 이동하면 그 게시판의 필드와 기본 보기를 사용한다', async () => {
    renderPage()
    await tableMode()
    await userEvent.click(screen.getByRole('link', { name: '다른 게시판 열기' }))
    await screen.findByRole('heading', { name: '다른 게시판' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('메모:')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '추가 정보 표시 방식' })).toHaveValue('inline')
  })
})

describe('표 열 순서·크기 개인 설정', () => {
  beforeEach(() =>
    useAuthStore.setState({ user: { id: 'u1', tenant_id: 't1', role: 'TENANT_ADMIN' } } as never)
  )
  const openControls = async () => {
    await tableMode()
    await userEvent.click(screen.getByText('열 순서·크기'))
  }
  const headers = () =>
    within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((el) => el.textContent)
  it('순서/크기를 적용하고 다시 열어도 저장된 설정을 사용하며 조회/쓰기 API를 보내지 않는다', async () => {
    const view = renderPage()
    await openControls()
    const calls = get.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: '메모 열 앞으로' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '메모 열 크기' }), 'wide')
    expect(headers()).toEqual(['게시글', '메모', '수량', '작업'])
    expect(screen.getByRole('columnheader', { name: '메모' })).toHaveClass('min-w-64')
    expect(get.mock.calls).toHaveLength(calls)
    expect(patch).not.toHaveBeenCalled()
    const saved = readTableLayouts()
    expect(Object.values(saved)[0]).toEqual({
      order: ['note', 'count'],
      sizes: { note: 'wide', count: 'normal' },
    })
    view.unmount()
    usePostTableLayoutStore.setState({ layouts: saved })
    renderPage()
    await tableMode()
    expect(headers()).toEqual(['게시글', '메모', '수량', '작업'])
    expect(screen.getByRole('columnheader', { name: '메모' })).toHaveClass('min-w-64')
  })
  it('다른 계정/사업체/게시판에 설정을 적용하지 않는다', async () => {
    renderPage()
    await openControls()
    await userEvent.click(screen.getByRole('button', { name: '메모 열 앞으로' }))
    for (const user of [
      { id: 'u2', tenant_id: 't1', role: 'TENANT_ADMIN' },
      { id: 'u1', tenant_id: 't2', role: 'TENANT_ADMIN' },
    ]) {
      act(() => useAuthStore.setState({ user } as never))
      expect(headers()).toEqual(['게시글', '수량', '메모', '작업'])
    }
    act(() =>
      useAuthStore.setState({ user: { id: 'u1', tenant_id: 't1', role: 'TENANT_ADMIN' } } as never)
    )
    expect(headers()).toEqual(['게시글', '메모', '수량', '작업'])
    await userEvent.click(screen.getByRole('link', { name: '다른 게시판 열기' }))
    await tableMode()
    expect(headers()).toEqual(['게시글', '다른 칸', '작업'])
  })
  it('필드 변경은 저장 순서와 새 칸을 조합하고 초기화는 기본 필드 순서/크기로 돌아간다', async () => {
    renderPage()
    await openControls()
    await userEvent.click(screen.getByRole('button', { name: '메모 열 앞으로' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '수량 열 크기' }), 'narrow')
    fields = [
      field('new', { label: '새 칸', display_order: -1 }),
      field('count', { label: '수량', field_type: 'NUMBER', display_order: 1 }),
    ]
    await userEvent.click(screen.getByRole('button', { name: '상단 고정' }))
    await waitFor(() => expect(headers()).toEqual(['게시글', '수량', '새 칸', '작업']))
    expect(screen.getByRole('columnheader', { name: '수량' })).toHaveClass('min-w-32')
    await userEvent.click(screen.getByRole('button', { name: '열 설정 초기화' }))
    expect(headers()).toEqual(['게시글', '새 칸', '수량', '작업'])
    expect(screen.getByRole('columnheader', { name: '수량' })).toHaveClass('min-w-40')
  })
  it('저장 실패는 안내하고 선택은 유지하며 재시도할 수 있다', async () => {
    renderPage()
    await openControls()
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '메모 열 크기' }), 'wide')
    expect(screen.getByRole('alert')).toHaveTextContent('현재 화면에만 적용됩니다')
    expect(screen.getByRole('columnheader', { name: '메모' })).toHaveClass('min-w-64')
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: '저장 다시 시도' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(Object.values(readTableLayouts())[0].sizes.note).toBe('wide')
    const resetFailure = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await userEvent.click(screen.getByRole('button', { name: '열 설정 초기화' }))
    expect(screen.getByRole('alert')).toHaveTextContent('현재 화면에만 적용됩니다')
    expect(screen.getByRole('columnheader', { name: '메모' })).toHaveClass('min-w-40')
    resetFailure.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: '저장 다시 시도' }))
    expect(readTableLayouts()).toEqual({})
  })
  it('뷰어도 개인 보기만 저장할 수 있고 글 작업/서버 변경은 없다', async () => {
    useAuthStore.setState({
      user: { id: 'viewer', tenant_id: 't1', role: 'TENANT_VIEWER' },
    } as never)
    renderPage()
    await openControls()
    expect(screen.getByRole('button', { name: '수량 열 앞으로' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '메모 열 뒤로' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '메모 열 앞으로' }))
    expect(headers()).toEqual(['게시글', '메모', '수량'])
    expect(patch).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
