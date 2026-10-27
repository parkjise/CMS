import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RestoreDraftDialog } from '@/components/layout/RestoreDraftDialog'
import { useClientAuthStore } from '@/lib/authStore'
import { useEditStore } from '@/lib/editStore'

/** 편집 초안 복구 창 — 페이지 로드 때 한 번만, 로그인 확인 뒤에 (T-064-A) */

const draft = {
  's1:main_title': {
    section_id: 's1',
    field: 'main_title',
    original_value: '옛 제목',
    new_value: '새 제목',
    changed_at: '2026-10-27T00:00:00Z',
  },
}

const setAuth = (isLoggedIn: boolean, isInitialized: boolean) =>
  act(() => useClientAuthStore.setState({ user: null, isLoggedIn, isInitialized }))

beforeEach(() => {
  useClientAuthStore.setState({ user: null, isLoggedIn: false, isInitialized: false })
  useEditStore.setState({ isEditMode: false, pendingChanges: draft, isDirty: true })
})
afterEach(cleanup)

describe('RestoreDraftDialog', () => {
  it('로그인 확인 전에는 초안을 지우지도, 창을 띄우지도 않는다', () => {
    render(<RestoreDraftDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useEditStore.getState().pendingChanges).toEqual(draft)
  })

  it('로그인 확인 후 초안이 있으면 묻고, 이어가기를 누르면 편집 모드로', () => {
    render(<RestoreDraftDialog />)
    setAuth(true, true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '편집 이어가기' }))
    expect(useEditStore.getState().isEditMode).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('비로그인으로 확인되면 초안을 폐기한다', () => {
    render(<RestoreDraftDialog />)
    setAuth(false, true)
    expect(useEditStore.getState().pendingChanges).toEqual({})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('편집 중 새 변경이 생겨도 다시 뜨지 않는다', () => {
    useEditStore.setState({ pendingChanges: {}, isDirty: false })
    render(<RestoreDraftDialog />)
    setAuth(true, true)
    act(() => useEditStore.getState().updateField('s1', 'main_title', '편집 중', '옛 제목'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
