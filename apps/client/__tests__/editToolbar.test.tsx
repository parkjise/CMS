import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

/** 변경사항 1건이 있는 편집 모드 상태로 진입 */
const enterWithChange = () => {
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
}

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
    vi.clearAllMocks()
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

  it('저장 중에는 스피너를 노출하고 버튼을 비활성화한다', async () => {
    const user = userEvent.setup()
    enterWithChange()

    // saveAll을 수동 제어 가능한 Promise로 모킹하여 저장 중 상태 관찰
    let resolveSave: (v: {
      saved_count: number
      failed_count: number
      cache_purged: boolean
    }) => void = () => {}
    vi.spyOn(useEditStore.getState(), 'saveAll').mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )

    render(<EditToolbar />)
    const saveBtn = screen.getByLabelText(/저장 \(1개 변경사항\)/)
    await user.click(saveBtn)

    // 저장 중: 스피너 노출 + aria-busy + 비활성화
    expect(screen.getByTestId('save-spinner')).toBeInTheDocument()
    expect(saveBtn).toHaveAttribute('aria-busy', 'true')
    expect(saveBtn).toBeDisabled()

    resolveSave({ saved_count: 1, failed_count: 0, cache_purged: true })
    await waitFor(() =>
      expect(screen.queryByTestId('save-spinner')).toBeNull(),
    )
  })

  it('전체 성공 시 성공 토스트를 노출한다', async () => {
    const user = userEvent.setup()
    enterWithChange()
    vi.spyOn(useEditStore.getState(), 'saveAll').mockResolvedValue({
      saved_count: 1,
      failed_count: 0,
      cache_purged: true,
    })

    render(<EditToolbar />)
    await user.click(screen.getByLabelText(/저장 \(1개 변경사항\)/))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('부분 실패 시 saved/failed 카운트를 담은 에러 토스트를 노출한다', async () => {
    const user = userEvent.setup()
    enterWithChange()
    vi.spyOn(useEditStore.getState(), 'saveAll').mockResolvedValue({
      saved_count: 1,
      failed_count: 2,
      cache_purged: false,
    })

    render(<EditToolbar />)
    await user.click(screen.getByLabelText(/저장 \(1개 변경사항\)/))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('1개 저장, 2개 실패'),
      ),
    )
  })

  it('저장 중 예외 발생 시 실패 토스트를 노출한다', async () => {
    const user = userEvent.setup()
    enterWithChange()
    vi.spyOn(useEditStore.getState(), 'saveAll').mockRejectedValue(
      new Error('network'),
    )

    render(<EditToolbar />)
    await user.click(screen.getByLabelText(/저장 \(1개 변경사항\)/))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
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
