import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SectionControls } from '@/components/edit/SectionControls'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

const patchMock = vi.fn()

vi.mock('@/lib/api', () => ({
  authApi: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const resetStores = () => {
  useEditStore.setState({
    isEditMode: false,
    pendingChanges: {},
    isDirty: false,
  })
  useClientAuthStore.setState({ user: null, isLoggedIn: false })
}

const enableEditMode = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true })
}

interface Item {
  id: string
  label: string
  order: number
}

/** SectionRenderer와 동일한 wrapper 구조로 여러 섹션을 렌더 */
const renderSections = (items: Item[]) =>
  render(
    <>
      {items.map((it) => (
        <div
          key={it.id}
          data-section-wrapper={it.id}
          data-display-order={it.order}
          className="section-wrapper"
        >
          <SectionControls sectionId={it.id} label={it.label} />
        </div>
      ))}
    </>,
  )

const THREE: Item[] = [
  { id: 'sec-1', label: '히어로', order: 1 },
  { id: 'sec-2', label: '소개', order: 2 },
  { id: 'sec-3', label: '서비스', order: 3 },
]

const wrapperOrder = () =>
  Array.from(document.querySelectorAll('[data-section-wrapper]')).map(
    (el) => (el as HTMLElement).dataset.sectionWrapper,
  )

describe('SectionControls', () => {
  beforeEach(() => {
    resetStores()
    patchMock.mockReset()
    patchMock.mockResolvedValue({ data: { success: true, data: null } })
  })

  afterEach(() => {
    cleanup()
  })

  it('비편집 모드에서는 컨트롤 바를 렌더하지 않는다', () => {
    renderSections(THREE)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('편집 모드에서 섹션 라벨과 컨트롤 바를 노출한다', () => {
    enableEditMode()
    renderSections(THREE)
    const toolbars = screen.getAllByRole('toolbar')
    expect(toolbars).toHaveLength(3)
    expect(screen.getByText('히어로')).toBeInTheDocument()
  })

  it('첫 섹션은 위로, 마지막 섹션은 아래로 버튼이 비활성화된다', () => {
    enableEditMode()
    renderSections(THREE)
    const upButtons = screen.getAllByLabelText('섹션 위로 이동')
    const downButtons = screen.getAllByLabelText('섹션 아래로 이동')

    expect(upButtons[0]).toBeDisabled() // 첫 섹션 위로 X
    expect(downButtons[0]).toBeEnabled()
    expect(upButtons[2]).toBeEnabled()
    expect(downButtons[2]).toBeDisabled() // 마지막 섹션 아래로 X
  })

  it('위로 이동 시 DOM 순서를 교환하고 order PATCH를 호출한다', async () => {
    enableEditMode()
    renderSections(THREE)
    expect(wrapperOrder()).toEqual(['sec-1', 'sec-2', 'sec-3'])

    // sec-2의 [위로] 클릭
    fireEvent.click(screen.getAllByLabelText('섹션 위로 이동')[1])

    expect(wrapperOrder()).toEqual(['sec-2', 'sec-1', 'sec-3'])
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1))
    expect(patchMock).toHaveBeenCalledWith('/sections/order', {
      sections: [
        { id: 'sec-2', display_order: 1 },
        { id: 'sec-1', display_order: 2 },
        { id: 'sec-3', display_order: 3 },
      ],
    })
  })

  it('order PATCH 실패 시 DOM 순서를 원복한다', async () => {
    patchMock.mockRejectedValueOnce(new Error('network'))
    enableEditMode()
    renderSections(THREE)

    fireEvent.click(screen.getAllByLabelText('섹션 아래로 이동')[0])
    // 낙관적 교환
    expect(wrapperOrder()).toEqual(['sec-2', 'sec-1', 'sec-3'])

    // 실패 → 원복
    await waitFor(() =>
      expect(wrapperOrder()).toEqual(['sec-1', 'sec-2', 'sec-3']),
    )
  })

  it('숨기기 클릭 시 toggle PATCH를 호출하고 상태가 토글된다', async () => {
    enableEditMode()
    renderSections([THREE[0]])

    const hideBtn = screen.getByLabelText('섹션 숨기기')
    fireEvent.click(hideBtn)

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/sections/sec-1/toggle'),
    )
    // 토글 후 다시 표시 버튼으로 전환
    expect(screen.getByLabelText('섹션 다시 표시')).toBeInTheDocument()
  })
})
