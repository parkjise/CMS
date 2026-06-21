import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const resetStores = () => {
  useEditStore.setState({
    isEditMode: false,
    pendingChanges: {},
    isDirty: false,
  })
  useClientAuthStore.setState({
    user: null,
    isLoggedIn: false,
  })
}

describe('EditToolbar', () => {
  beforeEach(() => {
    resetStores()
    document.body.classList.remove('edit-mode')
  })

  it('편집 모드가 아닐 때는 렌더링되지 않는다', () => {
    const { container } = render(<EditToolbar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('편집 모드 진입 시 툴바 + body.edit-mode 클래스 적용', () => {
    useClientAuthStore.setState({ isLoggedIn: true })
    useEditStore.setState({ isEditMode: true })

    render(<EditToolbar />)
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
    expect(screen.getByText('편집 모드')).toBeInTheDocument()
    expect(document.body.classList.contains('edit-mode')).toBe(true)
  })

  it('변경사항 없으면 저장 버튼 비활성 + 카운트 미표시', () => {
    useClientAuthStore.setState({ isLoggedIn: true })
    useEditStore.setState({ isEditMode: true })

    render(<EditToolbar />)
    const saveBtn = screen.getByLabelText(/저장 \(0개 변경사항\)/)
    expect(saveBtn).toBeDisabled()
  })

  it('변경사항 있으면 카운트 뱃지 노출 + 저장 클릭 시 saveAll 호출', async () => {
    const user = userEvent.setup()
    useClientAuthStore.setState({ isLoggedIn: true })
    useEditStore.setState({
      isEditMode: true,
      isDirty: true,
      pendingChanges: {
        'sec-1:main_title': {
          section_id: 'sec-1',
          field: 'main_title',
          original_value: 'old',
          new_value: 'new',
          changed_at: new Date().toISOString(),
        },
      },
    })

    const saveAllSpy = vi
      .spyOn(useEditStore.getState(), 'saveAll')
      .mockResolvedValue({
        saved_count: 1,
        failed_count: 0,
        cache_purged: true,
      })

    render(<EditToolbar />)

    expect(screen.getByText('1')).toBeInTheDocument()

    const saveBtn = screen.getByLabelText(/저장 \(1개 변경사항\)/)
    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)

    await waitFor(() => expect(saveAllSpy).toHaveBeenCalledTimes(1))
  })

  it('isDirty=false에서 편집 종료 클릭 시 즉시 exitEditMode 호출', async () => {
    const user = userEvent.setup()
    useClientAuthStore.setState({ isLoggedIn: true })
    useEditStore.setState({ isEditMode: true, isDirty: false })

    const exitSpy = vi.spyOn(useEditStore.getState(), 'exitEditMode')

    render(<EditToolbar />)
    await user.click(screen.getByRole('button', { name: '편집 종료' }))

    expect(exitSpy).toHaveBeenCalled()
  })
})
