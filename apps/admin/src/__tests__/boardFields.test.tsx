import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, BoardField, Post } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import {
  customFieldOfError,
  fieldValueLabel,
  initialCustomValues,
  nextOptionValue,
  toCustomData,
  validateCustomValues,
} from '@/lib/customFields'
import { BoardFieldsPage } from '@/pages/BoardFieldsPage'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/boards/RichTextEditor', () => ({ RichTextEditor: () => <div>본문 편집기</div> }))
vi.mock('@/lib/api', () => ({ api: { get, post, patch, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  id: 'b1',
  name: '후기',
  slug: 'reviews',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: null,
  post_count: 2,
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
}

const fieldOf = (over: Partial<BoardField> & { id: string; field_key: string }): BoardField => ({
  board_id: 'b1',
  label: over.field_key,
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
  ...over,
})

const rating = fieldOf({ id: 'f1', field_key: 'rating', label: '별점', field_type: 'RATING', is_required: true, value_count: 3 })
const memo = fieldOf({ id: 'f2', field_key: 'memo', label: '메모' })

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = ({
  boards = [board],
  fields = [rating, memo],
  trash = [],
  postData,
}: { boards?: Board[]; fields?: BoardField[]; trash?: BoardField[]; postData?: Post } = {}) => {
  get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) => {
    if (url === '/v1/boards') return ok(boards)
    if (url.endsWith('/fields')) return ok(config?.params?.trash ? trash : fields)
    if (url.includes('/posts/')) return ok(postData)
    return ok(null)
  })
}

const setRole = (role: string) => useAuthStore.setState({ user: { role } } as never)

const Where = () => <p>이동한 화면</p>

const renderFields = (id = 'b1') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[`/admin/boards/${id}/fields`]}>
      <Routes>
        <Route path="/admin/boards/:boardId/fields" element={<BoardFieldsPage />} />
      </Routes>
    </MemoryRouter>,
  )

const renderEdit = (path = '/admin/boards/b1/posts/new') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/boards/:boardId/posts/new" element={<BoardPostEditPage />} />
        <Route path="/admin/boards/:boardId/posts/:postId/edit" element={<BoardPostEditPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('필드 관리', () => {
  it('목록 · 값 있는 글 수 · 미리보기', async () => {
    mockApi()
    renderFields()
    expect(await screen.findByText(/값 있는 글 3개/)).toBeInTheDocument()
    expect(screen.getByText('글쓰기 폼 미리보기')).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: /별점 \(필수\)/ })).toBeInTheDocument()
  })

  it('칸이 없으면 안내', async () => {
    mockApi({ fields: [] })
    renderFields()
    expect(await screen.findByText(/아직 칸이 없습니다/)).toBeInTheDocument()
  })

  it('칸 추가 — 하나 고르기는 선택지를 받고, 내부 값은 이름과 따로', async () => {
    mockApi({ fields: [] })
    post.mockResolvedValue({ data: { data: memo } })
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '칸 추가' }))
    await userEvent.type(screen.getByLabelText(/칸 이름/, { selector: 'input[required]' }), ' 진료 과목 ')
    await userEvent.selectOptions(screen.getByLabelText('유형'), 'SELECT')
    await userEvent.click(screen.getByRole('button', { name: '선택지 추가' }))
    await userEvent.type(screen.getByLabelText('선택지 1'), '내과')
    const form = screen.getByRole('button', { name: '취소' }).parentElement!
    await userEvent.click(within(form).getByRole('button', { name: '칸 추가' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/v1/boards/b1/fields',
        expect.objectContaining({
          label: '진료 과목',
          field_type: 'SELECT',
          options: [{ value: 'opt_1', label: '내과' }],
          field_key: undefined,
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('기본값 · 글 목록 표시를 저장하고, 유형을 바꾸면 기본값을 비운다 (T-147)', async () => {
    mockApi({ fields: [] })
    post.mockResolvedValue({ data: { data: memo } })
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '칸 추가' }))
    await userEvent.type(screen.getByLabelText(/칸 이름/, { selector: 'input[required]' }), '메모')
    await userEvent.type(screen.getByLabelText('기본값'), '처음 값')
    await userEvent.selectOptions(screen.getByLabelText('유형'), 'NUMBER')
    await userEvent.selectOptions(screen.getByLabelText('유형'), 'TEXT')
    expect(screen.getByLabelText('기본값')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('기본값'), '둘째 값')
    await userEvent.click(screen.getByLabelText(/글 목록에 표시/))
    const form = screen.getByRole('button', { name: '취소' }).parentElement!
    await userEvent.click(within(form).getByRole('button', { name: '칸 추가' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/v1/boards/b1/fields',
        expect.objectContaining({ default_value: '둘째 값', show_in_list: true }),
      ),
    )
  })

  it('형식이 틀린 기본값은 저장하지 않는다 (T-147)', async () => {
    mockApi({ fields: [] })
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '칸 추가' }))
    await userEvent.type(screen.getByLabelText(/칸 이름/, { selector: 'input[required]' }), '홈페이지')
    await userEvent.selectOptions(screen.getByLabelText('유형'), 'URL')
    await userEvent.type(screen.getByLabelText('기본값'), 'javascript:alert(1)')
    const form = screen.getByRole('button', { name: '취소' }).parentElement!
    await userEvent.click(within(form).getByRole('button', { name: '칸 추가' }))
    expect(await screen.findByText(/http:\/\/ 또는 https:\/\//)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('이름 · 선택지 없이는 저장하지 않는다', async () => {
    mockApi({ fields: [] })
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '칸 추가' }))
    await userEvent.selectOptions(screen.getByLabelText('유형'), 'MULTI_SELECT')
    const form = screen.getByRole('button', { name: '취소' }).parentElement!
    await userEvent.click(within(form).getByRole('button', { name: '칸 추가' }))
    expect(await screen.findByText('칸 이름을 입력해주세요.')).toBeInTheDocument()
    expect(screen.getByText(/선택지 이름을 하나 이상/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('숫자 범위가 뒤집히면 막는다', async () => {
    mockApi({ fields: [] })
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '칸 추가' }))
    await userEvent.type(screen.getByLabelText(/칸 이름/, { selector: 'input[required]' }), '점수')
    await userEvent.selectOptions(screen.getByLabelText('유형'), 'NUMBER')
    await userEvent.type(screen.getByLabelText('최솟값'), '5')
    await userEvent.type(screen.getByLabelText('최댓값'), '1')
    const form = screen.getByRole('button', { name: '취소' }).parentElement!
    await userEvent.click(within(form).getByRole('button', { name: '칸 추가' }))
    expect(await screen.findByText(/최솟값은 최댓값보다/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('값이 있는 칸은 유형을 바꿀 수 없다고 알린다', async () => {
    mockApi()
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '별점 수정' }))
    expect(screen.getByLabelText('유형')).toBeDisabled()
    expect(screen.getByText(/값이 있는 글이 3개 있어/)).toBeInTheDocument()
    expect(screen.getByText('rating')).toBeInTheDocument()
  })

  it('수정 저장은 PATCH, 서버 거부를 알린다', async () => {
    mockApi()
    patch.mockRejectedValue({
      response: { data: { error: { code: 'CONFLICT', message: '글에서 쓰고 있는 선택지는 지울 수 없습니다.' } } },
    })
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '메모 수정' }))
    await userEvent.click(screen.getByRole('button', { name: '칸 저장' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/boards/b1/fields/f2', expect.anything()))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('삭제 전에 값 있는 글 수를 알리고, 취소하면 지우지 않는다', async () => {
    mockApi()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderFields()
    await userEvent.click(await screen.findByRole('button', { name: '별점 삭제' }))
    expect(confirm.mock.calls[0][0]).toMatch(/글 3개.*값은 지워지지 않고/)
    expect(del).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    del.mockResolvedValue({})
    await userEvent.click(screen.getByRole('button', { name: '별점 삭제' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/boards/b1/fields/f1'))
    confirm.mockRestore()
  })

  it('위 · 아래 버튼으로 순서를 바꾼다', async () => {
    mockApi()
    patch.mockResolvedValue({ data: { data: [] } })
    renderFields()
    expect(await screen.findByRole('button', { name: '별점 위로' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '메모 위로' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/fields/order', { field_ids: ['f2', 'f1'] }),
    )
  })

  it('삭제한 칸을 복원한다', async () => {
    mockApi({ trash: [fieldOf({ id: 'f9', field_key: 'old', label: '지운 칸' })] })
    post.mockResolvedValue({ data: { data: {} } })
    renderFields()
    await screen.findByText('삭제한 칸 1개')
    await userEvent.click(screen.getByText('삭제한 칸 1개'))
    await userEvent.click(screen.getByRole('button', { name: '지운 칸 복원' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/b1/fields/f9/restore'))
  })

  it('20개면 더 추가할 수 없다', async () => {
    mockApi({ fields: Array.from({ length: 20 }, (_, i) => fieldOf({ id: `x${i}`, field_key: `k${i}` })) })
    renderFields()
    expect(await screen.findByRole('button', { name: '칸 추가' })).toBeDisabled()
    expect(screen.getByText(/20개까지/)).toBeInTheDocument()
  })

  it('기본 게시판은 안내만', async () => {
    mockApi({ boards: [{ ...board, system_key: 'notice' }] })
    renderFields()
    expect(await screen.findByText('기본 게시판에는 칸을 추가할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '칸 추가' })).not.toBeInTheDocument()
  })

  it('보기 전용 계정은 고칠 수 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi()
    renderFields()
    await screen.findByText(/값 있는 글 3개/)
    for (const name of ['칸 추가', '별점 수정', '별점 삭제', '별점 위로']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})

describe('글쓰기 폼', () => {
  const stored: Post = {
    id: 'p1',
    board_id: 'b1',
    title: '예전 글',
    status: 'PUBLISHED',
    is_pinned: false,
    published_at: '2026-11-01T00:00:00Z',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    deleted_at: null,
    body: [],
    custom_data: { memo: '있던 값' },
  }

  const typeTitle = async () =>
    userEvent.type(await screen.findByLabelText(/제목/, { selector: 'input[required]' }), '글')

  it('임시저장은 필수 칸이 비어도 보내고, 빈 칸은 null', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: stored } })
    renderEdit()
    await typeTitle()
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/v1/boards/b1/posts',
        expect.objectContaining({ status: 'DRAFT', custom_data: { rating: null, memo: null } }),
      ),
    )
  })

  it('공개하려면 필수 칸 — 칸 아래에 오류, 보내지 않는다', async () => {
    mockApi()
    renderEdit()
    await typeTitle()
    await userEvent.click(screen.getByRole('button', { name: '공개하기' }))
    expect(await screen.findByText('필수 칸입니다.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    // 값을 고르면 오류가 사라진다
    await userEvent.click(screen.getByRole('radio', { name: '4점' }))
    await waitFor(() => expect(screen.queryByText('필수 칸입니다.')).not.toBeInTheDocument())
  })

  it('값을 넣어 공개한다 — 별점은 숫자로', async () => {
    mockApi()
    post.mockResolvedValue({ data: { data: stored } })
    renderEdit()
    await typeTitle()
    await userEvent.click(screen.getByRole('radio', { name: '5점' }))
    await userEvent.type(screen.getByLabelText('메모'), '좋아요')
    await userEvent.click(screen.getByRole('button', { name: '공개하기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/v1/boards/b1/posts',
        expect.objectContaining({ status: 'PUBLISHED', custom_data: { rating: 5, memo: '좋아요' } }),
      ),
    )
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
  })

  it('예전 글은 나중에 생긴 필수 칸이 비어도 저장된다', async () => {
    mockApi({ postData: stored })
    patch.mockResolvedValue({ data: { data: stored } })
    renderEdit('/admin/boards/b1/posts/p1/edit')
    expect(await screen.findByLabelText('메모')).toHaveValue('있던 값')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/v1/boards/b1/posts/p1',
        expect.objectContaining({ custom_data: { rating: null, memo: '있던 값' } }),
      ),
    )
  })

  it('서버가 거부한 칸 아래에 메시지', async () => {
    mockApi()
    post.mockRejectedValue({
      response: { data: { error: { code: 'VALIDATION_ERROR', message: '서버 오류 문구', field: 'custom_data.memo' } } },
    })
    renderEdit()
    await typeTitle()
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('메모')).toHaveAttribute('aria-invalid', 'true'))
  })

  it('칸이 없는 게시판은 custom_data 를 보내지 않는다', async () => {
    mockApi({ fields: [] })
    post.mockResolvedValue({ data: { data: stored } })
    renderEdit()
    await typeTitle()
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).not.toHaveProperty('custom_data')
  })

  it('칸을 못 불러오면 안내하고 값은 보내지 않는다', async () => {
    mockApi()
    const base = get.getMockImplementation()!
    get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) =>
      url.endsWith('/fields') ? Promise.reject(new Error('x')) : base(url, config),
    )
    post.mockResolvedValue({ data: { data: stored } })
    renderEdit()
    expect(await screen.findByText(/추가 칸을 불러오지 못했습니다/, {}, { timeout: 5000 })).toBeInTheDocument()
    await typeTitle()
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][1]).not.toHaveProperty('custom_data')
  }, 15000)
})

describe('칸 값 규칙', () => {
  const required = (key: string) => fieldOf({ id: key, field_key: key, is_required: true })

  it('필수: 처음 공개하는 글만 빈 칸을 막고, 공개했던 글은 있던 값을 비울 때만', () => {
    const f = [required('a')]
    expect(validateCustomValues(f, {}, { publishing: false, first: true, stored: {} })).toEqual({})
    expect(validateCustomValues(f, {}, { publishing: true, first: true, stored: {} })).toHaveProperty('a')
    expect(validateCustomValues(f, {}, { publishing: true, first: false, stored: {} })).toEqual({})
    expect(validateCustomValues(f, { a: '' }, { publishing: true, first: false, stored: { a: 'x' } })).toHaveProperty('a')
  })

  it.each([
    [{ field_type: 'NUMBER', min: 1, max: 5 }, '9', /이하/],
    [{ field_type: 'NUMBER' }, 'abc', /숫자/],
    [{ field_type: 'DATE' }, '2026/11/01', /날짜/],
    [{ field_type: 'SELECT', options: [{ value: 'a', label: 'A' }] }, 'z', /선택할 수 없는/],
    [{ field_type: 'IMAGE' }, 'javascript:alert(1)', /사진 주소/],
    [{ field_type: 'TEXT' }, 'x'.repeat(201), /200자/],
  ] as const)('%o 에 %s 는 오류', (over, value, pattern) => {
    const field = fieldOf({ id: 'k', field_key: 'k', ...(over as Partial<BoardField>) })
    const errors = validateCustomValues([field], { k: value }, { publishing: false, first: true, stored: {} })
    expect(errors.k).toMatch(pattern)
  })

  it('false 는 값이고, 빈 값은 null 로 보낸다', () => {
    const f = [
      fieldOf({ id: '1', field_key: 'b', field_type: 'BOOLEAN' }),
      fieldOf({ id: '2', field_key: 'n', field_type: 'NUMBER' }),
      fieldOf({ id: '3', field_key: 'm', field_type: 'MULTI_SELECT' }),
    ]
    expect(toCustomData(f, { b: false, n: '3', m: [] })).toEqual({ b: false, n: 3, m: null })
  })

  it('시작 값 — 새 글은 기본값, 고치는 글은 저장된 값', () => {
    const f = [fieldOf({ id: '1', field_key: 'r', field_type: 'RATING', default_value: 3 })]
    expect(initialCustomValues(f, null)).toEqual({ r: 3 })
    expect(initialCustomValues(f, {})).toEqual({ r: '' })
    expect(initialCustomValues(f, { r: 5 })).toEqual({ r: 5 })
  })

  it('서버 오류에서 칸 이름을 꺼낸다', () => {
    expect(customFieldOfError({ response: { data: { error: { field: 'custom_data.k' } } } })).toBe('k')
    expect(customFieldOfError({ response: { data: { error: { field: 'title' } } } })).toBeNull()
    expect(customFieldOfError(new Error('x'))).toBeNull()
  })

  it('선택지 내부 값은 쓰던 번호를 피한다', () => {
    expect(nextOptionValue(['opt_1', 'opt_3'])).toBe('opt_2')
  })
})

describe('연락처 · 이메일 · 링크 값 (T-147)', () => {
  const contact = (field_type: BoardField['field_type']) => fieldOf({ id: 'c', field_key: 'c', field_type })
  const check = (field: BoardField, c: unknown) =>
    validateCustomValues([field], { c }, { publishing: false, first: true, stored: {} }).c

  it.each([
    ['PHONE', '010-1234-5678'],
    ['EMAIL', 'a@example.com'],
    ['URL', 'https://example.com/a'],
  ] as const)('%s 맞는 값', (type, value) => {
    expect(check(contact(type), value)).toBeUndefined()
  })

  it.each([
    ['PHONE', 'abc'],
    ['EMAIL', 'no-at'],
    ['URL', 'javascript:alert(1)'],
    ['URL', 'example.com'],
  ] as const)('%s 틀린 값 %s', (type, value) => {
    expect(check(contact(type), value)).toBeTruthy()
  })

  it('목록 글자 — 선택지는 이름, 별점, 예/아니오', () => {
    const select = fieldOf({
      id: 's',
      field_key: 's',
      field_type: 'SELECT',
      options: [{ value: 'opt_1', label: '내과' }],
    })
    expect(fieldValueLabel(select, 'opt_1')).toBe('내과')
    expect(fieldValueLabel(fieldOf({ id: 'r', field_key: 'r', field_type: 'RATING' }), 4)).toBe('★4')
    expect(fieldValueLabel(fieldOf({ id: 'b', field_key: 'b', field_type: 'BOOLEAN' }), false)).toBe('아니오')
  })
})
