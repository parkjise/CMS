import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Board, BoardLimits } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { boardSlugError } from '@/lib/boardLabels'
import { BoardConnectionPage } from '@/pages/BoardConnectionPage'
import { BoardDesignPage } from '@/pages/BoardDesignPage'
import { BoardNewPage } from '@/pages/BoardNewPage'
import { BoardSettingsPage } from '@/pages/BoardSettingsPage'
import { BoardTrashPage } from '@/pages/BoardTrashPage'
import { BoardsPage } from '@/pages/BoardsPage'
import { useAuthStore } from '@/stores/authStore'

const { get, post, patch, put, del, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, post, patch, put, delete: del } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const board: Board = {
  updated_at: '2026-11-05T00:00:00Z',
  id: 'b1',
  name: '병원 소식',
  slug: 'board-1',
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
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
}
const notice: Board = { ...board, id: 'n1', name: '공지사항', slug: 'notice', system_key: 'notice' }

const openLimits: BoardLimits = { plan: 'STANDARD', limit: 5, used: 1, can_create: true, reason: null }
const closedLimits: BoardLimits = {
  plan: 'BASIC',
  limit: 0,
  used: 0,
  can_create: false,
  reason: '게시판 추가는 STANDARD 요금제부터 쓸 수 있습니다.',
}

const ok = (data: unknown) => Promise.resolve({ data: { data } })

// 새 게시판 유형별 추천 칸 (T-183)
const PRESETS = {
  LIST: [],
  FAQ: [],
  GALLERY: [
    { key: 'taken_on', label: '촬영일', field_type: 'DATE', choices: [], show_in_list: false },
    { key: 'place', label: '장소', field_type: 'TEXT', choices: [], show_in_list: false },
  ],
  CARD: [
    {
      key: 'employment_type',
      label: '근무 형태',
      field_type: 'SELECT',
      choices: ['정규직', '계약직'],
      show_in_list: true,
    },
    { key: 'deadline', label: '마감일', field_type: 'DATE', choices: [], show_in_list: true },
  ],
}

const mockApi = ({
  boards = [board],
  limits = openLimits,
  trash = [],
  mode = 'code',
  presets = PRESETS,
}: {
  boards?: Board[]
  limits?: BoardLimits
  trash?: Board[]
  mode?: 'code' | 'theme'
  presets?: unknown
}) => {
  get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) => {
    if (url === '/v1/boards/limits') return ok(limits)
    if (url === '/v1/boards/presets')
      return presets === 'error' ? Promise.reject(new Error('down')) : ok(presets)
    if (url === '/v1/boards') return ok(config?.params?.trash ? trash : boards)
    if (url === '/v1/site-settings/menu') return ok({ mode, reorderable: mode === 'code', items: [] })
    return ok(undefined)
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
    </MemoryRouter>,
  )

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role } } as unknown as Parameters<typeof useAuthStore.setState>[0])

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('주소 이름 검사', () => {
  it.each(['news', 'news-2027', 'a1'])('%s 는 통과', (slug) => {
    expect(boardSlugError(slug)).toBeUndefined()
  })
  it.each(['a', 'Upper', '한글', '-x', 'a--b', 'a_b'])('%s 는 거부', (slug) => {
    expect(boardSlugError(slug)).toBeDefined()
  })
})

describe('게시판 목록', () => {
  const renderList = () => renderAt('/admin/boards', <BoardsPage />, '/admin/boards')

  it('한도 안이면 추가 버튼', async () => {
    mockApi({})
    renderList()
    expect(await screen.findByRole('link', { name: '게시판 추가' })).toHaveAttribute('href', '/admin/boards/new')
    expect(screen.getByRole('link', { name: '병원 소식 설정' })).toHaveAttribute('href', '/admin/boards/b1/settings')
  })

  it('테마형에서도 공지 게시판에 "표시되지 않음" 안내가 없다 (T-176)', async () => {
    mockApi({ boards: [notice, board], mode: 'theme' })
    renderList()
    await screen.findByRole('link', { name: '공지사항 설정' })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/v1/site-settings/menu'))
    expect(screen.queryByText('지금 템플릿에는 표시되지 않습니다')).not.toBeInTheDocument()
  })

  it('한도를 넘으면 이유와 요금제 링크', async () => {
    mockApi({ boards: [notice], limits: closedLimits })
    renderList()
    expect(await screen.findByText(/STANDARD 요금제부터/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '요금제 보기' })).toHaveAttribute('href', '/admin/billing')
    expect(screen.queryByRole('link', { name: '게시판 추가' })).not.toBeInTheDocument()
  })

  it('보기 전용 계정에는 추가 버튼 · 한도 안내가 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({ limits: closedLimits })
    renderList()
    await screen.findByRole('link', { name: '병원 소식 설정' })
    await waitFor(() => expect(get).toHaveBeenCalledWith('/v1/boards/limits'))
    expect(screen.queryByRole('link', { name: '게시판 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '요금제 보기' })).not.toBeInTheDocument()
  })
})

describe('게시판 추가 마법사', () => {
  const renderNew = () => renderAt('/admin/boards/new', <BoardNewPage />, '/admin/boards/new')
  const next = () => userEvent.click(screen.getByRole('button', { name: '다음' }))

  it('보기 전용 계정에는 입력 칸 대신 안내를 보여 준다', async () => {
    mockApi({})
    const user = useAuthStore.getState().user
    useAuthStore.setState({ user: { ...user, role: 'TENANT_VIEWER' } as typeof user })
    renderNew()
    expect(await screen.findByText(/보기 전용 계정은 게시판을 추가할 수 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument()
    useAuthStore.setState({ user })
  })

  it('이름 없이는 다음으로 가지 않는다', async () => {
    mockApi({})
    renderNew()
    await next()
    expect(await screen.findByText('이름을 입력해주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /갤러리형/ })).not.toBeInTheDocument()
  })

  it('잘못된 주소 이름을 막는다', async () => {
    mockApi({})
    renderNew()
    await userEvent.type(screen.getByLabelText(/게시판 이름/), '소식')
    await userEvent.type(screen.getByLabelText('주소 이름'), '한글')
    await next()
    expect(await screen.findByText(/영문 소문자/)).toBeInTheDocument()
  })

  it('3단계를 거쳐 만들고 다음 할 일을 보여 준다', async () => {
    mockApi({})
    post.mockResolvedValue({ data: { data: { ...board, id: 'new1' } } })
    renderNew()
    await userEvent.type(screen.getByLabelText(/게시판 이름/), ' 병원 소식 ')
    await next()
    await userEvent.click(screen.getByRole('radio', { name: /갤러리형/ }))
    await next()
    await userEvent.click(screen.getByRole('radio', { name: /사용 안 함/ }))
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards', {
        name: '병원 소식',
        description: '',
        slug: undefined,
        board_type: 'GALLERY',
        status: 'INACTIVE',
        in_menu: true,
        preset_fields: ['taken_on', 'place'],
      }),
    )
    expect(await screen.findByRole('link', { name: '첫 글 쓰기' })).toHaveAttribute(
      'href',
      '/admin/boards/new1/posts/new',
    )
    expect(screen.getByRole('link', { name: '칸 설정' })).toHaveAttribute(
      'href',
      '/admin/boards/new1/fields',
    )
    expect(screen.getByText(/상단 메뉴에 추가했습니다/)).toBeInTheDocument()
    expect(screen.getByText(/추천 칸 2개를 함께 만들었습니다/)).toBeInTheDocument()
  })

  describe('유형별 추천 칸 (T-183)', () => {
    const toTypeStep = async () => {
      await userEvent.type(screen.getByLabelText(/게시판 이름/), '채용')
      await next()
    }

    it('일반 목록은 추천 칸이 없고, 카드형은 모두 체크된 채 나온다', async () => {
      mockApi({})
      renderNew()
      await toTypeStep()
      expect(screen.queryByRole('group', { name: '함께 만들 추천 칸' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('radio', { name: /카드형/ }))
      const group = await screen.findByRole('group', { name: '함께 만들 추천 칸' })
      expect(within(group).getByRole('checkbox', { name: /근무 형태/ })).toBeChecked()
      expect(within(group).getByText(/하나 고르기: 정규직 · 계약직/)).toBeInTheDocument()
    })

    it('체크를 푼 칸은 빼고, 유형마다 선택을 기억한다', async () => {
      mockApi({})
      post.mockResolvedValue({ data: { data: { ...board, id: 'new1' } } })
      renderNew()
      await toTypeStep()
      await userEvent.click(screen.getByRole('radio', { name: /카드형/ }))
      await userEvent.click(await screen.findByRole('checkbox', { name: /근무 형태/ }))
      await userEvent.click(screen.getByRole('radio', { name: /갤러리형/ }))
      expect(screen.getByRole('checkbox', { name: /촬영일/ })).toBeChecked()
      await userEvent.click(screen.getByRole('radio', { name: /카드형/ }))
      expect(screen.getByRole('checkbox', { name: /근무 형태/ })).not.toBeChecked()
      await next()
      await userEvent.click(screen.getByRole('button', { name: '만들기' }))
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
          '/v1/boards',
          expect.objectContaining({ board_type: 'CARD', preset_fields: ['deadline'] }),
        ),
      )
      expect(await screen.findByText(/추천 칸 1개를 함께 만들었습니다/)).toBeInTheDocument()
    })

    it('추천 칸을 못 불러와도 게시판은 만든다', async () => {
      mockApi({ presets: 'error' })
      post.mockResolvedValue({ data: { data: { ...board, id: 'new1' } } })
      renderNew()
      await toTypeStep()
      await userEvent.click(screen.getByRole('radio', { name: /카드형/ }))
      expect(await screen.findByText(/추천 칸을 불러오지 못했습니다/)).toBeInTheDocument()
      await next()
      await userEvent.click(screen.getByRole('button', { name: '만들기' }))
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith('/v1/boards', expect.objectContaining({ preset_fields: [] })),
      )
      expect(screen.queryByText(/추천 칸 .*개를 함께 만들었습니다/)).not.toBeInTheDocument()
    })
  })

  const toLastStep = async () => {
    await userEvent.type(screen.getByLabelText(/게시판 이름/), '소식')
    await next()
    await next()
  }

  it('[메뉴에 추가]는 기본 켜짐, 끄면 메뉴에 넣지 않는다', async () => {
    mockApi({})
    post.mockResolvedValue({ data: { data: { ...board, id: 'new1' } } })
    renderNew()
    await toLastStep()
    const checkbox = await screen.findByRole('checkbox', { name: /상단 메뉴에 추가/ })
    expect(checkbox).toBeChecked()
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/boards', expect.objectContaining({ in_menu: false })),
    )
    expect(await screen.findByText(/상단 메뉴에는 넣지 않았습니다/)).toBeInTheDocument()
  })

  it('사용 안 함이면 [메뉴에 추가]가 없고, 켜면 나온다고 안내', async () => {
    mockApi({})
    post.mockResolvedValue({ data: { data: { ...board, id: 'new1', status: 'INACTIVE' } } })
    renderNew()
    await toLastStep()
    await userEvent.click(screen.getByRole('radio', { name: /사용 안 함/ }))
    expect(screen.queryByRole('checkbox', { name: /상단 메뉴에 추가/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    expect(await screen.findByText(/사용으로 바꾸면 홈페이지 상단 메뉴에 나옵니다/)).toBeInTheDocument()
  })


  it('이전으로 돌아가도 입력이 남는다', async () => {
    mockApi({})
    renderNew()
    await userEvent.type(screen.getByLabelText(/게시판 이름/), '소식')
    await next()
    await userEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByLabelText(/게시판 이름/)).toHaveValue('소식')
  })

  it('한도를 넘으면 마법사 대신 안내', async () => {
    mockApi({ limits: closedLimits })
    renderNew()
    expect(await screen.findByText(/STANDARD 요금제부터/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/게시판 이름/)).not.toBeInTheDocument()
  })

  it('실패를 알리고 입력을 유지한다', async () => {
    mockApi({})
    post.mockRejectedValue(new Error('x'))
    renderNew()
    await userEvent.type(screen.getByLabelText(/게시판 이름/), '소식')
    await next()
    await next()
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '만들기' })).toBeInTheDocument()
  })
})

describe('기본 정보 탭', () => {
  const renderSettings = (id = 'b1') =>
    renderAt(`/admin/boards/${id}/settings`, <BoardSettingsPage />, '/admin/boards/:boardId/settings')

  it('이름 · 설명을 저장한다', async () => {
    mockApi({})
    patch.mockResolvedValue({ data: { data: board } })
    renderSettings()
    const name = await screen.findByLabelText(/게시판 이름/)
    await userEvent.clear(name)
    await userEvent.type(name, '새 이름')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
        name: '새 이름',
        description: '',
        seo_title: '',
        seo_description: '',
        seo_index: true,
      }),
    )
  })

  it('검색 노출을 저장한다', async () => {
    mockApi({})
    patch.mockResolvedValue({ data: { data: board } })
    renderSettings()
    await userEvent.type(await screen.findByLabelText(/검색 제목/), '  소식 모음 ')
    await userEvent.type(screen.getByLabelText(/검색 설명/), '병원 소식')
    await userEvent.click(screen.getByLabelText(/검색 결과에 표시/))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
        name: '병원 소식',
        description: '',
        seo_title: '소식 모음',
        seo_description: '병원 소식',
        seo_index: false,
      }),
    )
  })

  it('기본 게시판은 검색 노출 칸이 없다', async () => {
    mockApi({ boards: [notice] })
    patch.mockResolvedValue({ data: { data: notice } })
    renderSettings('n1')
    await screen.findByLabelText(/게시판 이름/)
    expect(screen.queryByLabelText(/검색 제목/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).not.toHaveProperty('seo_title')
  })

  it('탭 — 새 게시판은 필드 관리 · 카테고리까지, 현재 탭 표시', async () => {
    mockApi({})
    renderSettings()
    const tabs = await screen.findByRole('navigation', { name: '게시판 상세' })
    await screen.findByLabelText(/게시판 이름/)
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent)).toEqual([
      '글 관리',
      '기본 정보',
      '필드 관리',
      '카테고리',
      '게시판 디자인',
      '권한',
      '운영 설정',
      '홈페이지 연결',
    ])
    expect(within(tabs).getByRole('link', { name: '기본 정보' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: '필드 관리' })).toHaveAttribute(
      'href',
      '/admin/boards/b1/fields',
    )
  })

  it('기본 게시판은 필드 관리 · 카테고리 탭 · 삭제 버튼 없음', async () => {
    mockApi({ boards: [notice] })
    renderSettings('n1')
    await screen.findByLabelText(/게시판 이름/)
    expect(screen.queryByRole('link', { name: '필드 관리' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '카테고리' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '권한' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '운영 설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '휴지통으로' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '복제' })).toBeInTheDocument()
  })

  it('복제하면 복제본 설정으로 이동', async () => {
    mockApi({})
    post.mockResolvedValue({ data: { data: { ...board, id: 'copy1' } } })
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: '복제' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/b1/duplicate'))
    expect(await screen.findByText('게시판을 찾을 수 없습니다.')).toBeInTheDocument()
  })

  it('휴지통으로 옮기기 전에 글 수와 메뉴에서 빠진다고 확인하고, 옮기면 목록으로', async () => {
    mockApi({})
    del.mockResolvedValue({})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: '휴지통으로' }))
    expect(confirm.mock.calls[0][0]).toMatch(/글 2개.*메뉴/)
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/boards/b1'))
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
    confirm.mockRestore()
  })

  it('확인에서 취소하면 옮기지 않는다', async () => {
    mockApi({})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: '휴지통으로' }))
    expect(del).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('저장 실패를 알린다', async () => {
    mockApi({})
    patch.mockRejectedValue(new Error('x'))
    renderSettings()
    await screen.findByLabelText(/게시판 이름/)
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('보기 전용 계정은 잠기고 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({})
    renderSettings()
    expect(await screen.findByLabelText(/게시판 이름/)).toBeDisabled()
    for (const name of ['저장', '복제', '휴지통으로']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('없는 게시판은 안내', async () => {
    mockApi({ boards: [] })
    renderSettings('nope')
    expect(await screen.findByText('게시판을 찾을 수 없습니다.')).toBeInTheDocument()
  })
})

describe('게시판 디자인 탭 (T-148)', () => {
  const renderDesign = (id = 'b1') =>
    renderAt(`/admin/boards/${id}/design`, <BoardDesignPage />, '/admin/boards/:boardId/design')

  it('목록형 홈페이지 추가 정보 표 표시를 디자인과 함께 저장하고 실패 시 선택을 유지한다', async () => {
    mockApi({})
    patch.mockRejectedValueOnce(new Error('저장 실패')).mockResolvedValue({data:{data:board}})
    renderDesign()
    const select = await screen.findByLabelText('홈페이지 추가 정보 표시')
    expect(select).toHaveValue('inline')
    await userEvent.selectOptions(select,'columns')
    await userEvent.click(screen.getByRole('button',{name:'저장'}))
    await waitFor(()=>expect(toast.error).toHaveBeenCalled())
    expect(select).toHaveValue('columns')
    await userEvent.click(screen.getByRole('button',{name:'저장'}))
    await waitFor(()=>expect(patch).toHaveBeenLastCalledWith('/v1/boards/b1',expect.objectContaining({design:{...board.design,list_layout:'columns'}})))
    await userEvent.click(screen.getByRole('radio',{name:/갤러리형/}))
    expect(screen.queryByLabelText('홈페이지 추가 정보 표시')).not.toBeInTheDocument()
  })

  it('홈페이지 열 변경은 저장 전 요청하지 않고 실패 뒤 재시도에도 유지한다', async () => {
    mockApi({boards:[{...board,design:{...board.design,list_layout:'columns'}}]})
    const fallback = get.getMockImplementation()!
    get.mockImplementation((url, config) => url === '/v1/boards/b1/fields' ? ok([
      {id:'f1',board_id:'b1',field_key:'team',label:'부서',is_visible:true,show_in_list:true,display_order:0,deleted_at:null},
      {id:'f2',board_id:'b1',field_key:'count',label:'인원',is_visible:true,show_in_list:true,display_order:1,deleted_at:null},
    ]) : fallback(url, config))
    patch.mockRejectedValueOnce(new Error('실패')).mockResolvedValue({data:{data:board}})
    renderDesign()
    await userEvent.selectOptions(await screen.findByLabelText('인원 홈페이지 열 크기'),'wide')
    await userEvent.click(screen.getByRole('button',{name:'인원 홈페이지 열 앞으로'}))
    expect(patch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button',{name:'저장'}))
    await waitFor(()=>expect(toast.error).toHaveBeenCalled())
    expect(screen.getByLabelText('인원 홈페이지 열 크기')).toHaveValue('wide')
    await userEvent.click(screen.getByRole('button',{name:'저장'}))
    await waitFor(()=>expect(patch).toHaveBeenLastCalledWith('/v1/boards/b1',expect.objectContaining({design:expect.objectContaining({list_column_layout:[{key:'count',size:'wide'},{key:'team',size:'normal'}]})})))
  })

  it('카드형을 고르면 카드 설정이 나오고 함께 저장한다', async () => {
    mockApi({})
    patch.mockResolvedValue({ data: { data: board } })
    renderDesign()
    await userEvent.click(await screen.findByRole('radio', { name: /카드형/ }))
    await userEvent.selectOptions(screen.getByLabelText('PC 한 줄 개수'), '4개')
    await userEvent.selectOptions(screen.getByLabelText('사진 비율'), '16:9')
    await userEvent.click(screen.getByLabelText(/요약 표시/))
    await userEvent.selectOptions(screen.getByLabelText('기본 정렬'), '제목순')
    await userEvent.selectOptions(screen.getByLabelText('페이지당 글 수'), '20개')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
        sort_order: 'TITLE',
        page_size: 20,
        board_type: 'CARD',
        design: { ...board.design, columns: 4, image_ratio: '16:9', show_summary: false },
      }),
    )
  })

  it('유형마다 맞는 설정만 보인다', async () => {
    mockApi({})
    renderDesign()
    await screen.findByRole('radio', { name: /목록형/ })
    expect(screen.queryByLabelText('사진 비율')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/작성일 표시/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /FAQ형/ }))
    expect(screen.getByLabelText(/한 번에 하나만 펼치기/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/작성일 표시/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /갤러리형/ }))
    expect(screen.getByLabelText('사진 비율')).toBeInTheDocument()
    expect(screen.queryByLabelText(/요약 표시/)).not.toBeInTheDocument()
  })

  it('글이 있는 게시판의 유형을 바꾸면 경고, 글이 없으면 없음', async () => {
    mockApi({})
    const first = renderDesign()
    await userEvent.click(await screen.findByRole('radio', { name: /갤러리형/ }))
    expect(screen.getByText(/빈 칸으로 보일 수 있습니다/)).toBeInTheDocument()
    first.unmount()
    mockApi({ boards: [{ ...board, post_count: 0 }] })
    renderDesign()
    await userEvent.click(await screen.findByRole('radio', { name: /갤러리형/ }))
    expect(screen.queryByText(/빈 칸으로 보일 수 있습니다/)).not.toBeInTheDocument()
  })

  it('자동으로 되돌린 글 수는 null 을 보낸다', async () => {
    mockApi({ boards: [{ ...board, page_size: 30 }] })
    patch.mockResolvedValue({ data: { data: board } })
    renderDesign()
    await userEvent.selectOptions(await screen.findByLabelText('페이지당 글 수'), '자동 (유형에 맞게)')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patch.mock.calls[0][1]).toMatchObject({ page_size: null }))
  })

  it('기본 게시판은 정렬 · 글 수만 저장한다', async () => {
    mockApi({ boards: [notice] })
    patch.mockResolvedValue({ data: { data: notice } })
    renderDesign('n1')
    await screen.findByLabelText('기본 정렬')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/n1', { sort_order: 'LATEST', page_size: null }),
    )
  })
})

describe('홈페이지 연결 탭', () => {
  const renderConnection = (id = 'b1') =>
    renderAt(`/admin/boards/${id}/connection`, <BoardConnectionPage />, '/admin/boards/:boardId/connection')

  const withMenu = (visible: boolean) => {
    mockApi({})
    const base = get.getMockImplementation()!
    get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) =>
      url === '/v1/site-settings/menu'
        ? ok({
            mode: 'code',
            reorderable: true,
            items: [
              { key: 'about', default_label: '소개', label: '회사', visible: true },
              { key: 'board:b1', default_label: '병원 소식', label: null, visible },
            ],
          })
        : base(url, config),
    )
  }

  it('주소 · 사용 여부를 저장한다', async () => {
    mockApi({})
    patch.mockResolvedValue({ data: { data: board } })
    renderConnection()
    await userEvent.click(await screen.findByLabelText(/게시판 사용/))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/boards/b1', {
        slug: 'board-1',
        status: 'INACTIVE',
      }),
    )
  })

  it('기본 게시판은 주소 잠금', async () => {
    mockApi({ boards: [notice] })
    renderConnection('n1')
    expect(await screen.findByLabelText('주소 이름')).toBeDisabled()
  })

  it('주소를 바꾸면 이전 주소가 열리지 않는다고 알리고, 잘못된 주소는 막는다', async () => {
    mockApi({})
    renderConnection()
    const slug = await screen.findByLabelText('주소 이름')
    expect(screen.queryByText(/이전 주소는/)).not.toBeInTheDocument()
    await userEvent.type(slug, '-2')
    expect(screen.getByText(/이전 주소는 더 이상 열리지 않습니다/)).toBeInTheDocument()
    await userEvent.type(slug, '한글')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText(/영문 소문자/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('상단 메뉴 표시를 끄면 다른 메뉴 설정은 그대로 저장', async () => {
    withMenu(true)
    put.mockResolvedValue({ data: { data: { mode: 'code', reorderable: true, items: [] } } })
    renderConnection()
    await userEvent.click(await screen.findByLabelText(/상단 메뉴에 표시/))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/v1/site-settings/menu', {
        items: [
          { key: 'about', label: '회사', visible: true },
          { key: 'board:b1', label: null, visible: false },
        ],
      }),
    )
  })

  it.each([
    ['code', 'notice'],
    ['theme', 'board:n1'],
  ] as const)('%s 템플릿의 공지는 메뉴 키 %s 로 켜고 끈다 (T-176)', async (mode, key) => {
    mockApi({ boards: [notice] })
    const base = get.getMockImplementation()!
    get.mockImplementation((url: string, config?: { params?: { trash?: boolean } }) =>
      url === '/v1/site-settings/menu'
        ? ok({
            mode,
            reorderable: mode === 'code',
            items: [{ key, default_label: '공지사항', label: null, visible: true }],
          })
        : base(url, config),
    )
    put.mockResolvedValue({ data: { data: { mode, reorderable: false, items: [] } } })
    renderConnection('n1')
    await userEvent.click(await screen.findByLabelText(/상단 메뉴에 표시/))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/v1/site-settings/menu', {
        items: [{ key, label: null, visible: false }],
      }),
    )
  })

  it('메뉴 후보가 아니면(사용 안 함) 켜면 고를 수 있다고 안내', async () => {
    mockApi({ boards: [{ ...board, status: 'INACTIVE' }] })
    renderConnection()
    expect(await screen.findByText(/사용으로 바꾸면 상단 메뉴 표시를/)).toBeInTheDocument()
  })

  it('보기 전용 계정은 저장 버튼이 없다', async () => {
    setRole('TENANT_VIEWER')
    mockApi({})
    renderConnection()
    expect(await screen.findByLabelText('주소 이름')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })
})

describe('게시판 휴지통', () => {
  const trashed = { ...board, deleted_at: '2026-11-02T00:00:00Z' }
  const renderTrash = () => renderAt('/admin/boards/trash', <BoardTrashPage />, '/admin/boards/trash')

  it('복원한다', async () => {
    mockApi({ trash: [trashed] })
    post.mockResolvedValue({ data: { data: { board, slug_changed: false } } })
    renderTrash()
    await userEvent.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/boards/b1/restore'))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it('주소가 바뀌면 알려 준다', async () => {
    mockApi({ trash: [trashed] })
    post.mockResolvedValue({ data: { data: { board: { ...board, slug: 'board-1-2' }, slug_changed: true } } })
    renderTrash()
    await userEvent.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('board-1-2')))
  })

  it('요금제 한도로 실패하면 이유를 보여 준다', async () => {
    mockApi({ trash: [trashed] })
    post.mockRejectedValue({
      response: { status: 422, data: { error: { message: '한도 초과' } } },
    })
    renderTrash()
    await userEvent.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('빈 휴지통 · 보기 전용', async () => {
    mockApi({})
    const { unmount } = renderTrash()
    expect(await screen.findByText('휴지통이 비어 있습니다.')).toBeInTheDocument()
    unmount()

    setRole('TENANT_VIEWER')
    mockApi({ trash: [trashed] })
    renderTrash()
    await screen.findByText('병원 소식')
    expect(screen.queryByRole('button', { name: '복원' })).not.toBeInTheDocument()
  })
})


describe('모든 추가 게시판 유형의 목록 표시 선택 (T-160)', () => {
  it.each(['LIST', 'CARD', 'GALLERY', 'FAQ'] as const)('%s 디자인 탭에 필드 선택을 제공한다', async (boardType) => {
    mockApi({ boards: [{ ...board, board_type: boardType }] })
    renderAt('/admin/boards/b1/design', <BoardDesignPage />, '/admin/boards/:boardId/design')
    expect(await screen.findByRole('heading', { name: '목록에 표시할 추가 정보' })).toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledWith('/v1/boards/b1/fields', undefined))
  })
  it('기본 공지에는 필드 선택과 조회를 추가하지 않는다', async () => {
    mockApi({ boards: [notice] })
    renderAt('/admin/boards/n1/design', <BoardDesignPage />, '/admin/boards/:boardId/design')
    await screen.findByRole('heading', { name: '목록 표시' })
    expect(screen.queryByRole('heading', { name: '목록에 표시할 추가 정보' })).not.toBeInTheDocument()
    expect(get.mock.calls.some(([url]) => String(url).endsWith('/fields'))).toBe(false)
  })
})
