import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Board } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { BoardBasicFields } from '@/pages/BoardSettingsPage'
import { usageWarning } from '@/lib/boardUsage'
import { useAuthStore } from '@/stores/authStore'

// 게시판 화면의 사용 위치 (T-243, 페이지 기획서 CM-01) — 게시판 연결 섹션 목록 · 지우기 확인

const { get, del } = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, delete: del, post: vi.fn() } }))

const board = (extra: Partial<Board> = {}) =>
  ({
    id: 'b1',
    name: '의료진',
    slug: 'team',
    system_key: null,
    post_count: 0,
    ...extra,
  }) as Board

const USAGE = [
  {
    section_id: 's1',
    section_type: 'BOARD_LATEST',
    label: '의료진 소개',
    page_key: 'about',
    page_title: '병원 소개',
    is_active: true,
  },
  {
    section_id: 's2',
    section_type: 'BOARD_LATEST',
    label: '게시판 연결',
    page_key: 'home',
    page_title: '홈',
    is_active: false,
  },
]

const ok = (data: unknown) => Promise.resolve({ data: { data } })
const value = { name: '의료진', description: '', seo_title: '', seo_description: '', seo_index: true, is_content: false }

const renderFields = (b: Board) =>
  renderWithQuery(
    <MemoryRouter>
      <BoardBasicFields board={b} value={value} onChange={vi.fn()} onRemoved={vi.fn()} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } as never })
})
afterEach(() => vi.restoreAllMocks())

describe('사용 위치', () => {
  it('이 게시판을 보여 주는 섹션을 페이지와 함께, 섹션 편집 링크로', async () => {
    get.mockImplementation((url: string) => (url === '/v1/boards/b1/usage' ? ok(USAGE) : ok(null)))
    renderFields(board())
    expect(await screen.findByRole('link', { name: '의료진 소개' })).toHaveAttribute(
      'href',
      '/admin/pages/about/sections/s1',
    )
    expect(screen.getByText('병원 소개')).toBeInTheDocument()
    expect(screen.getByText('숨김')).toBeInTheDocument()
  })

  it('기본 정보에 콘텐츠형 게시판 켜기 (T-249)', async () => {
    get.mockImplementation(() => ok([]))
    const onChange = vi.fn()
    renderWithQuery(
      <MemoryRouter>
        <BoardBasicFields board={board()} value={value} onChange={onChange} onRemoved={vi.fn()} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /콘텐츠형 게시판/ }))
    expect(onChange).toHaveBeenCalledWith({ is_content: true })
  })

  it('없으면 게시판 연결 섹션을 추가하라고 안내한다', async () => {
    get.mockImplementation(() => ok([]))
    renderFields(board())
    expect(await screen.findByText(/아직 이 게시판을 보여 주는 섹션이 없어요/)).toBeInTheDocument()
  })

  it('연결할 수 없는 기본 게시판(공지 제외)에는 보이지 않는다', () => {
    get.mockImplementation(() => ok([]))
    renderFields(board({ system_key: 'reviews' }))
    expect(screen.queryByRole('heading', { name: '사용 위치' })).toBeNull()
    expect(get).not.toHaveBeenCalledWith('/v1/boards/b1/usage')
  })

  it('휴지통으로 옮길 때 연결된 섹션이 보이지 않게 된다고 알린다', async () => {
    get.mockImplementation(() => ok(USAGE))
    del.mockResolvedValue({})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderFields(board())
    await screen.findByRole('link', { name: '의료진 소개' })
    await userEvent.click(screen.getByRole('button', { name: '휴지통으로' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toContain('섹션 2개(병원 소개, 홈)도 홈페이지에서 보이지 않게')
    expect(del).not.toHaveBeenCalled()
  })
})

describe('usageWarning', () => {
  it('연결이 없거나 모르면 빈 글자, 같은 페이지는 한 번만', () => {
    expect(usageWarning(undefined)).toBe('')
    expect(usageWarning([])).toBe('')
    expect(usageWarning([USAGE[0], { ...USAGE[0], section_id: 's3' }])).toContain('섹션 2개(병원 소개)')
  })
})
