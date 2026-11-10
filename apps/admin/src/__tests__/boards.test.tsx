import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import type { Board, Post, PostList } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardPostEditPage } from '@/pages/BoardPostEditPage'
import { BoardPostsPage } from '@/pages/BoardPostsPage'
import { BoardsPage } from '@/pages/BoardsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, del, toastError } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  toastError: vi.fn(),
}))

// 실제 편집기는 richTextEditor.test.tsx — 여기는 글쓰기 흐름만
vi.mock('@/components/boards/RichTextEditor', () => ({
  RichTextEditor: ({
    initial,
    onChange,
  }: {
    initial: unknown[]
    onChange: (v: unknown[]) => void
  }) => (
    <textarea
      aria-label="내용"
      defaultValue={initial.length ? JSON.stringify(initial) : ''}
      onChange={(e) =>
        onChange([{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }])
      }
    />
  ),
}))

vi.mock('@/lib/api', () => ({ api: { get, post, patch, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast: { success: vi.fn(), error: toastError, info: vi.fn() },
}))

const board: Board = {
  updated_at: '2026-11-05T00:00:00Z',
  id: 'b1',
  name: '공지사항',
  slug: 'notice',
  description: '',
  board_type: 'LIST',
  status: 'ACTIVE',
  system_key: 'notice',
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
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
}

const item = {
  id: 'p1',
  board_id: 'b1',
  title: '휴진 안내',
  status: 'PUBLISHED',
  is_pinned: false,
  published_at: '2026-11-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  deleted_at: null,
} as const

const list = (overrides: Partial<PostList> = {}): PostList => ({
  total: 1,
  page: 1,
  size: 20,
  items: [item],
  ...overrides,
})

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const mockApi = ({
  boards = [board],
  posts = list(),
  detail,
  mode = 'code',
}: {
  mode?: 'code' | 'theme'
  boards?: Board[]
  posts?: PostList
  detail?: Post
}) => {
  get.mockImplementation((url: string) => {
    if (url.endsWith('/fields')) return Promise.resolve({ data: { data: [] } })
    if (url === '/v1/site-settings/menu') return ok({ mode, items: [] })
    if (url === '/v1/boards') return ok(boards)
    if (url === '/v1/boards/limits') {
      return ok({ plan: 'BASIC', limit: 0, used: 0, can_create: false, reason: '한도' })
    }
    if (url.endsWith('/posts')) return ok(posts)
    return ok(detail)
  })
}

const Where = () => <p>이동한 화면</p>

const renderAt = (path: string, page: React.ReactElement, route: string) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={page} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role } } as unknown as Parameters<
    typeof useAuthStore.setState
  >[0])

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
  useAuthStore.setState({ tenantSlug: 'clinic' })
})

const EditTarget = () => {
  const { postId } = useParams()
  return <p>수정 화면: {postId}</p>
}

const statusTab = (name: RegExp) =>
  within(screen.getByRole('group', { name: '사용 상태' })).getByRole('button', { name })

describe('게시판 목록', () => {
  it('글 수를 보여 주고 글 관리로 연결한다', async () => {
    mockApi({})
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    const link = await screen.findByRole('link', { name: /공지사항.*글 2개/ })
    expect(link).toHaveAttribute('href', '/admin/boards/b1/posts')
    expect(link).toHaveTextContent('2 건')
  })

  it('기본 공지의 실제 주소와 설정 수정 시각을 보여 준다', async () => {
    mockApi({})
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    const link = await screen.findByRole('link', { name: '공지사항 홈페이지 (새 창)' })
    expect(link).toHaveAttribute('href', 'http://localhost:3000/clinic/notice')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const time = screen.getByTitle('게시판 설정 수정일')
    expect(time).toHaveAttribute('datetime', board.updated_at)
    expect(time).toHaveTextContent('2026.11.05')
    expect(link.closest('a')?.parentElement?.closest('a')).toBeNull()
  })

  it('새 게시판은 /b/ 주소로 열고 보기 전용 계정도 확인한다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({ boards: [{ ...board, system_key: null, slug: 'news' }] })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByRole('link', { name: '공지사항 홈페이지 (새 창)' })).toHaveAttribute(
      'href',
      'http://localhost:3000/clinic/b/news'
    )
  })

  it('사용 안 함 게시판은 주소만 표시하고 열기 링크를 두지 않는다', async () => {
    mockApi({ boards: [{ ...board, status: 'INACTIVE', system_key: null, slug: 'news' }] })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('주소 http://localhost:3000/clinic/b/news')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /홈페이지/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '공지사항 설정' })).toBeInTheDocument()
  })

  it('테마형도 기본 공지는 /notice 로 열리고 새 게시판도 열린다 (T-176)', async () => {
    mockApi({
      mode: 'theme',
      boards: [board, { ...board, id: 'b2', name: '소식', system_key: null, slug: 'news' }],
    })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByRole('link', { name: '공지사항 홈페이지 (새 창)' })).toHaveAttribute(
      'href',
      'http://localhost:3000/clinic/notice'
    )
    expect(screen.getByRole('link', { name: '소식 홈페이지 (새 창)' })).toHaveAttribute(
      'href',
      'http://localhost:3000/clinic/b/news'
    )
  })

  it('사업체 주소나 유효한 수정일이 없으면 현재 시각으로 대신하지 않는다', async () => {
    useAuthStore.setState({ tenantSlug: null })
    mockApi({ boards: [{ ...board, updated_at: 'invalid' }] })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('홈페이지 주소 확인 불가')).toBeInTheDocument()
    expect(screen.getByText('설정 수정일 확인 불가')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /홈페이지/ })).not.toBeInTheDocument()
  })

  it('공유 주소의 경로 문자를 인코딩한다', async () => {
    useAuthStore.setState({ tenantSlug: 'clinic name' })
    mockApi({ boards: [{ ...board, system_key: null, slug: 'news' }] })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByRole('link', { name: '공지사항 홈페이지 (새 창)' })).toHaveAttribute(
      'href',
      'http://localhost:3000/clinic%20name/b/news'
    )
  })

  it('게시판이 없는 템플릿은 안내한다', async () => {
    mockApi({ boards: [] })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('아직 게시판이 없습니다.')).toBeInTheDocument()
  })

  it('불러오기 실패를 알린다', async () => {
    get.mockRejectedValue(new Error('x'))
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('게시판을 불러오지 못했습니다.')).toBeInTheDocument()
  })

  const searchBoards: Board[] = [
    board,
    { ...board, id: 'b2', name: '채용 NEWS', slug: 'jobs', system_key: null, board_type: 'CARD' },
    {
      ...board,
      id: 'b3',
      name: '지난 NEWS',
      slug: 'old',
      system_key: null,
      board_type: 'CARD',
      status: 'INACTIVE',
    },
    { ...board, id: 'b4', name: '사진', slug: 'photos', system_key: null, board_type: 'GALLERY' },
    { ...board, id: 'b5', name: '질문', slug: 'faq', system_key: null, board_type: 'FAQ' },
  ]

  it('이름은 공백과 영문 대소문자를 무시하고 유형 · 상태와 함께 좁힌다', async () => {
    const user = userEvent.setup()
    mockApi({ boards: searchBoards })
    renderAt('/admin/boards', <BoardsPage />, '/admin/boards')
    await screen.findByRole('link', { name: /공지사항.*글 2개/ })
    await user.type(screen.getByRole('searchbox', { name: '게시판 이름' }), ' news ')
    expect(screen.getByRole('status')).toHaveTextContent('전체 5개 중 2개')
    await user.selectOptions(screen.getByRole('combobox', { name: '게시판 유형' }), 'CARD')
    await user.click(statusTab(/^비활성/))
    expect(screen.getByRole('link', { name: /지난 NEWS.*글 2개/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /채용 NEWS.*글 2개/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('전체 5개 중 1개')
    await user.click(screen.getByRole('button', { name: '검색 초기화' }))
    expect(screen.getByRole('status')).toHaveTextContent('전체 5개 중 5개')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: '게시판 유형' })).toHaveValue('')
    expect(statusTab(/^전체 게시판/)).toHaveAttribute('aria-pressed', 'true')
  })

  it.each(['LIST', 'GALLERY', 'FAQ', 'CARD'])('URL의 %s 유형 조건을 복원한다', async (type) => {
    mockApi({ boards: searchBoards })
    renderAt(`/admin/boards?type=${type}`, <BoardsPage />, '/admin/boards')
    await screen.findByRole('status')
    expect(screen.getByRole('combobox', { name: '게시판 유형' })).toHaveValue(type)
    const count = searchBoards.filter((entry) => entry.board_type === type).length
    expect(screen.getByRole('status')).toHaveTextContent(`전체 5개 중 ${count}개`)
  })

  it('URL에서 이름 · 상태도 복원하고 결과 없음을 안내한다', async () => {
    mockApi({ boards: searchBoards })
    renderAt('/admin/boards?q=NEWS&type=GALLERY&status=INACTIVE', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('검색 조건에 맞는 게시판이 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('NEWS')
    expect(statusTab(/^비활성/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('아직 게시판이 없습니다.')).not.toBeInTheDocument()
  })

  it('알 수 없는 URL 필터는 전체로 취급하고 보기 전용도 검색할 수 있다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({ boards: searchBoards })
    renderAt('/admin/boards?type=UNKNOWN&status=UNKNOWN', <BoardsPage />, '/admin/boards')
    expect(await screen.findByRole('status')).toHaveTextContent('전체 5개 중 5개')
    expect(screen.getByRole('combobox', { name: '게시판 유형' })).toHaveValue('')
    expect(statusTab(/^전체 게시판/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('link', { name: '게시판 추가' })).not.toBeInTheDocument()
  })

  it('조건을 URL에 저장하고 초기화할 때 관련 없는 쿼리는 보존한다', async () => {
    const user = userEvent.setup()
    const Location = () => <span data-testid="location">{useLocation().search}</span>
    mockApi({ boards: searchBoards })
    renderAt(
      '/admin/boards?source=dashboard',
      <>
        <BoardsPage />
        <Location />
      </>,
      '/admin/boards'
    )
    await screen.findByRole('status')
    await user.type(screen.getByRole('searchbox'), 'NEWS')
    await user.selectOptions(screen.getByRole('combobox', { name: '게시판 유형' }), 'CARD')
    await user.click(statusTab(/^운영 중/))
    const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '')
    expect(params.get('q')).toBe('NEWS')
    expect(params.get('type')).toBe('CARD')
    expect(params.get('status')).toBe('ACTIVE')
    expect(params.get('source')).toBe('dashboard')
    await user.click(screen.getByRole('button', { name: '검색 초기화' }))
    expect(screen.getByTestId('location')).toHaveTextContent('?source=dashboard')
  })

  it('목록 필터가 기존 글쓰기 바로가기를 가리지 않는다', async () => {
    mockApi({ boards: searchBoards })
    renderAt('/admin/boards?write=notice&q=없는이름&type=CARD', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
  })

  it('홈페이지 [글쓰기] 주소는 글쓰기 화면으로 바로 간다', async () => {
    mockApi({})
    renderAt('/admin/boards?write=notice', <BoardsPage />, '/admin/boards')
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
  })
})

describe('글 관리', () => {
  const renderPosts = () =>
    renderAt('/admin/boards/b1/posts', <BoardPostsPage />, '/admin/boards/:boardId/posts')

  it('글 목록에 표시로 고른 칸만 값이 나온다 (T-147)', async () => {
    const custom = { ...board, id: 'b1', system_key: null }
    const field = (over: object) => ({
      id: 'f1',
      board_id: 'b1',
      display_order: 0,
      deleted_at: null,
      field_key: 'grade',
      label: '등급',
      field_type: 'SELECT',
      options: [{ value: 'opt_1', label: '우수' }],
      show_in_list: true,
      ...over,
    })
    get.mockImplementation((url: string) => {
      if (url === '/v1/boards') return ok([custom])
      if (url.endsWith('/fields')) {
        return ok([
          field({}),
          field({ id: 'f2', field_key: 'memo', label: '메모', show_in_list: false }),
        ])
      }
      if (url.endsWith('/categories')) return ok([])
      return ok(list({ items: [{ ...item, custom_data: { grade: 'opt_1', memo: '숨은 값' } }] }))
    })
    renderPosts()
    expect(await screen.findByText('우수')).toBeInTheDocument()
    expect(screen.getByText('등급:')).toBeInTheDocument()
    expect(screen.queryByText('숨은 값')).not.toBeInTheDocument()
  })

  it('글을 비공개로 바꾸고 삭제한다', async () => {
    mockApi({})
    patch.mockResolvedValue({ data: { data: item } })
    del.mockResolvedValue({})
    renderPosts()

    await userEvent.click(await screen.findByRole('button', { name: '비공개로' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1/posts/p1', { status: 'PRIVATE' })
    )

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/boards/b1/posts/p1'))
  })

  it('상단 고정을 바꾼다 · 실패를 알린다', async () => {
    mockApi({})
    patch.mockRejectedValue(new Error('x'))
    renderPosts()
    await userEvent.click(await screen.findByRole('button', { name: '상단 고정' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(patch).toHaveBeenCalledWith('/v1/boards/b1/posts/p1', { is_pinned: true })
  })

  it('휴지통 글은 복원만 할 수 있다', async () => {
    mockApi({ posts: list({ items: [{ ...item, deleted_at: '2026-11-02T00:00:00Z' }] }) })
    post.mockResolvedValue({})
    renderPosts()
    await userEvent.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/b1/posts/p1/restore'))
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('상태 · 검색 조건을 서버로 보낸다', async () => {
    mockApi({})
    renderPosts()
    await screen.findByText('휴진 안내')
    await userEvent.selectOptions(screen.getByLabelText('상태'), 'TRASH')
    await waitFor(() =>
      expect(get.mock.lastCall?.[1].params).toMatchObject({ trash: true, page: 1 })
    )
    await userEvent.type(screen.getByLabelText('제목 검색'), '휴진')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    await waitFor(() => expect(get.mock.lastCall?.[1].params).toMatchObject({ q: '휴진' }))
  })

  it('샘플 안내 — 확인하면 샘플을 지운다', async () => {
    mockApi({ boards: [{ ...board, has_samples: true }] })
    post.mockResolvedValue({})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPosts()
    await userEvent.click(await screen.findByRole('button', { name: '샘플 글 지우기' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/clear-samples'))
  })

  it('샘플 지우기를 취소하면 아무것도 하지 않는다', async () => {
    mockApi({ boards: [{ ...board, has_samples: true }] })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPosts()
    await userEvent.click(await screen.findByRole('button', { name: '샘플 글 지우기' }))
    expect(post).not.toHaveBeenCalled()
  })

  it('보기 전용 계정에는 쓰기 조작이 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({ boards: [{ ...board, has_samples: true }] })
    renderPosts()
    await screen.findByText('휴진 안내')
    await screen.findByText(/샘플 공지가 보입니다/)
    for (const name of ['삭제', '비공개로', '상단 고정', '샘플 글 지우기']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('link', { name: '글쓰기' })).not.toBeInTheDocument()
  })
})

describe('홈페이지에서 들어온 글쓰기 · 수정 (T-142-B-2)', () => {
  it('글 상세의 [수정] → 그 글 수정 화면으로', async () => {
    mockApi({})
    renderWithQuery(
      <MemoryRouter initialEntries={['/admin/boards?write=notice&post=p9']}>
        <Routes>
          <Route path="/admin/boards" element={<BoardsPage />} />
          <Route path="/admin/boards/:boardId/posts/:postId/edit" element={<EditTarget />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('수정 화면: p9')).toBeInTheDocument()
  })

  const renderPublished = (state: unknown, boards?: Board[], mode?: 'code' | 'theme') => {
    mockApi({ boards, mode })
    useAuthStore.setState({ tenantSlug: 'demo' } as never)
    renderWithQuery(
      <MemoryRouter initialEntries={[{ pathname: '/admin/boards/b1/posts', state }]}>
        <Routes>
          <Route path="/admin/boards/:boardId/posts" element={<BoardPostsPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('공개하고 돌아오면 홈페이지에서 보기 — 공지 주소', async () => {
    renderPublished({ publishedId: 'p9' })
    expect(await screen.findByRole('link', { name: '홈페이지에서 보기' })).toHaveAttribute(
      'href',
      'http://localhost:3000/demo/notice/p9'
    )
  })

  it('테마형도 공지 주소 (T-176)', async () => {
    renderPublished({ publishedId: 'p9' }, undefined, 'theme')
    expect(await screen.findByRole('link', { name: '홈페이지에서 보기' })).toHaveAttribute(
      'href',
      'http://localhost:3000/demo/notice/p9'
    )
  })

  it('새 게시판은 /b/ 주소', async () => {
    renderPublished({ publishedId: 'p9' }, [{ ...board, system_key: null, slug: 'news' }])
    expect(await screen.findByRole('link', { name: '홈페이지에서 보기' })).toHaveAttribute(
      'href',
      'http://localhost:3000/demo/b/news/p9'
    )
  })

  it('그냥 들어오면 없다', async () => {
    renderPublished(null)
    await screen.findByText('휴진 안내')
    expect(screen.queryByRole('link', { name: '홈페이지에서 보기' })).not.toBeInTheDocument()
  })
})

describe('글 작성 · 수정', () => {
  const renderNew = () =>
    renderAt(
      '/admin/boards/b1/posts/new',
      <BoardPostEditPage />,
      '/admin/boards/:boardId/posts/new'
    )

  const detail: Post = { ...item, body: [{ type: 'p', text: '기존 내용' }], custom_data: {} }
  const renderEdit = () =>
    renderAt(
      '/admin/boards/b1/posts/p1/edit',
      <BoardPostEditPage />,
      '/admin/boards/:boardId/posts/:postId/edit'
    )

  it('제목 없이는 저장하지 않는다', async () => {
    renderNew()
    await screen.findByLabelText('내용')
    await userEvent.click(screen.getByRole('button', { name: '공개하기' }))
    expect(await screen.findByText('제목을 입력해주세요.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('새 글을 공개하면 글 목록으로 돌아간다', async () => {
    post.mockResolvedValue({ data: { data: detail } })
    renderNew()
    await screen.findByLabelText('내용')
    await userEvent.type(screen.getByLabelText(/제목/), '  새 공지 ')
    await userEvent.type(screen.getByLabelText('내용'), '안내드립니다')
    await userEvent.click(screen.getByRole('button', { name: '공개하기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards/b1/posts', {
        title: '새 공지',
        body: [{ type: 'paragraph', content: [{ type: 'text', text: '안내드립니다' }] }],
        is_pinned: false,
        status: 'PUBLISHED',
      })
    )
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
  })

  it('상단 고정을 켜서 보낸다', async () => {
    post.mockResolvedValue({ data: { data: detail } })
    renderNew()
    await screen.findByLabelText('내용')
    await userEvent.type(screen.getByLabelText(/제목/), '고정 글')
    await userEvent.click(screen.getByLabelText('상단 고정'))
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(post.mock.lastCall?.[1]).toMatchObject({ is_pinned: true }))
  })

  it('임시저장은 DRAFT 로 보낸다', async () => {
    post.mockResolvedValue({ data: { data: detail } })
    renderNew()
    await screen.findByLabelText('내용')
    await userEvent.type(screen.getByLabelText(/제목/), '초안')
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(post.mock.lastCall?.[1]).toMatchObject({ title: '초안', status: 'DRAFT' })
    )
  })

  it('저장 실패를 알리고 화면에 남는다', async () => {
    post.mockRejectedValue(new Error('x'))
    renderNew()
    await screen.findByLabelText('내용')
    await userEvent.type(screen.getByLabelText(/제목/), '초안')
    await userEvent.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.queryByText('이동한 화면')).not.toBeInTheDocument()
  })

  it('기존 글을 불러와 고친다', async () => {
    mockApi({ detail })
    patch.mockResolvedValue({ data: { data: detail } })
    renderEdit()
    expect(await screen.findByLabelText('내용')).toHaveValue(JSON.stringify(detail.body))
    await userEvent.click(screen.getByRole('button', { name: '비공개로 저장' }))
    await waitFor(() =>
      expect(patch.mock.lastCall?.[1]).toMatchObject({ status: 'PRIVATE', title: '휴진 안내' })
    )
  })

  it('보기 전용 계정에는 저장 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({ detail })
    renderEdit()
    await screen.findByLabelText('내용')
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  it('다른 게시판으로 옮기면 옮긴 곳의 수정 화면으로 간다 (T-184)', async () => {
    mockApi({ detail, boards: [board, { ...board, id: 'b2', name: '채용 공고' }] })
    const base = get.getMockImplementation()
    get.mockImplementation((url: string) => (url.endsWith('/categories') ? ok([]) : base?.(url)))
    post.mockImplementation((url: string) =>
      url === '/v1/posts/move'
        ? ok({ moved: 1, values_dropped: 0 })
        : ok({
            posts: 1,
            target_name: '채용 공고',
            carried: [],
            dropped: [],
            blocked_count: 0,
            blocked: [],
          })
    )
    renderEdit()
    await screen.findByLabelText('내용')
    await userEvent.click(screen.getByRole('button', { name: '게시판 옮기기' }))
    expect(screen.getByText(/저장하지 않은 수정 내용은 옮기면서 사라집니다/)).toBeInTheDocument()
    await userEvent.selectOptions(await screen.findByLabelText('받을 게시판'), '채용 공고')
    await screen.findByText(/글 1개를 ‘채용 공고’\(으\)로 옮깁니다/)
    await userEvent.click(screen.getByRole('button', { name: '옮기기' }))
    // 같은 라우트라 옮긴 게시판 기준으로 글을 다시 읽는다
    await waitFor(() => expect(get).toHaveBeenCalledWith('/v1/boards/b2/posts/p1'))
    expect(post).toHaveBeenCalledWith('/v1/posts/move', {
      post_ids: ['p1'],
      target_board_id: 'b2',
      category_id: null,
    })
  })

  it('새 글에는 게시판 옮기기가 없다', async () => {
    renderNew()
    await screen.findByLabelText('내용')
    expect(screen.queryByRole('button', { name: '게시판 옮기기' })).not.toBeInTheDocument()
  })
})
