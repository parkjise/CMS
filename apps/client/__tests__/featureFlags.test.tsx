import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CopySuggestPopover } from '@/components/ai/CopySuggestPopover'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { SectionControls } from '@/components/edit/SectionControls'
import { authApi, getAccessToken } from '@/lib/api'
import { featureOn, useClientAuthStore } from '@/lib/authStore'
import { useEditStore } from '@/lib/editStore'

// 편집 모드 — 꺼진 기능의 버튼을 보여 주지 않는다 (T-138)
vi.mock('@/lib/api', () => ({
  authApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  publicApi: { post: vi.fn(), get: vi.fn() },
  getAccessToken: vi.fn(() => 'token'),
  setAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(async () => true),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const setFlags = (flags: Record<string, boolean> | null) =>
  useClientAuthStore.setState({ isLoggedIn: true, flags })

beforeEach(() => useEditStore.setState({ isEditMode: true, pendingChanges: {}, isDirty: false }))
afterEach(() => {
  useEditStore.setState({ isEditMode: false })
  useClientAuthStore.setState({ user: null, isLoggedIn: false, flags: null })
  vi.mocked(authApi.get).mockReset()
})

describe('featureOn', () => {
  it('값을 모르면 보여 주고, 알면 그 값을 따른다', () => {
    expect(featureOn('X')({ flags: null })).toBe(true)
    expect(featureOn('X')({ flags: { X: true } })).toBe(true)
    expect(featureOn('X')({ flags: { X: false } })).toBe(false)
    expect(featureOn('X')({ flags: {} })).toBe(false)
  })
})

describe('authStore 기능 플래그', () => {
  it('로그인 상태 확인 때 불러온다', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token')
    vi.mocked(authApi.get).mockImplementation(async (url: string) =>
      url === '/tenant/features'
        ? ({ data: { data: { flags: { AI_CHAT_EDIT: false } } } } as never)
        : ({ data: { data: { id: 'u1' } } } as never),
    )
    await useClientAuthStore.getState().initialize()
    expect(useClientAuthStore.getState().flags).toEqual({ AI_CHAT_EDIT: false })
  })

  it('불러오지 못해도 로그인은 유지 — 값은 모름', async () => {
    vi.mocked(authApi.get).mockImplementation(async (url: string) => {
      if (url === '/tenant/features') throw new Error('down')
      return { data: { data: { id: 'u1' } } } as never
    })
    await useClientAuthStore.getState().initialize()
    const state = useClientAuthStore.getState()
    expect(state.isLoggedIn).toBe(true)
    expect(state.flags).toBeNull()
  })
})

describe('편집 모드 화면', () => {
  it('AI 대화형 편집 꺼짐 — 툴바 버튼 없음', () => {
    setFlags({ AI_CHAT_EDIT: false })
    render(<EditToolbar />)
    expect(screen.queryByRole('button', { name: 'AI 어시스턴트' })).toBeNull()
  })

  it('AI 대화형 편집 켜짐 — 툴바 버튼 있음', () => {
    setFlags({ AI_CHAT_EDIT: true })
    render(<EditToolbar />)
    expect(screen.getByRole('button', { name: 'AI 어시스턴트' })).toBeInTheDocument()
  })

  it('문구 추천 꺼짐 — 추천 버튼 없음', () => {
    setFlags({ AI_COPY_SUGGEST: false })
    const { container } = render(
      <CopySuggestPopover sectionId="s1" field="main_title" currentValue="x" onApply={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('섹션 순서 변경 꺼짐 — 이동 버튼만 숨김', async () => {
    setFlags({ DRAG_SECTION_ORDER: false })
    render(<SectionControls sectionId="s1" label="소개" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '섹션 숨기기' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: '섹션 위로 이동' })).toBeNull()
    expect(screen.queryByRole('button', { name: '섹션 아래로 이동' })).toBeNull()
  })

  it('섹션 순서 변경 켜짐 — 이동 버튼 있음', () => {
    setFlags({ DRAG_SECTION_ORDER: true })
    render(<SectionControls sectionId="s1" label="소개" />)
    expect(screen.getByRole('button', { name: '섹션 위로 이동' })).toBeInTheDocument()
  })
})
