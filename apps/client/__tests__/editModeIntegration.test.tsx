/**
 * T-067 인라인 편집 모드 통합 테스트 (컴포넌트 + 스토어 연동)
 *
 * Playwright E2E(e2e/editmode.spec.ts)는 섹션이 Next 서버 컴포넌트에서 SSR되어
 * 브라우저 레벨 모킹이 불가능하고 시드된 백엔드가 필요하므로 별도 가드되어 있다.
 * 본 통합 테스트는 실제 EditToolbar + SectionControls + EditableText + editStore를
 * 한 화면에 조합해 진입 → 편집 → 저장(성공/실패/부분실패) → 이탈 가드 플로우를
 * API만 모킹한 채 결정론적으로 검증한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { SectionControls } from '@/components/edit/SectionControls'
import { EditableText } from '@/components/edit/EditableText'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

const postMock = vi.fn()
const patchMock = vi.fn()

vi.mock('@/lib/api', () => ({
  authApi: {
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const SECTION_ID = 'sec-1'
const FIELD = 'main_title'
const INITIAL = '원래 제목'

/** 실제 홈페이지 섹션 구조를 모사한 인라인 편집 하니스 */
function InlineEditHarness() {
  return (
    <>
      <EditToolbar />
      <div
        data-section-wrapper={SECTION_ID}
        data-display-order={1}
        className="section-wrapper"
      >
        <SectionControls sectionId={SECTION_ID} label="히어로" />
        <EditableText
          sectionId={SECTION_ID}
          field={FIELD}
          initialValue={INITIAL}
          as="h1"
        />
      </div>
    </>
  )
}

const resetStores = () => {
  useEditStore.setState({
    isEditMode: false,
    pendingChanges: {},
    isDirty: false,
  })
  useClientAuthStore.setState({ user: null, isLoggedIn: false })
  window.localStorage.clear()
}

const enterEditMode = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true })
}

/** EditableText를 편집하고 새 값으로 commit */
const editHeading = (value: string) => {
  const el = screen.getByText(INITIAL)
  fireEvent.click(el)
  el.innerText = value
  fireEvent.blur(el)
}

describe('인라인 편집 모드 통합 플로우 (T-067)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStores()
    document.body.classList.remove('edit-mode')
    postMock.mockResolvedValue({
      data: { data: { saved_count: 1, failed_count: 0, cache_purged: true } },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('편집 모드 진입 시 툴바와 섹션 컨트롤이 함께 노출된다', () => {
    enterEditMode()
    render(<InlineEditHarness />)

    expect(screen.getByRole('toolbar', { name: '편집 모드 툴바' })).toBeInTheDocument()
    expect(
      screen.getByRole('toolbar', { name: '히어로 섹션 컨트롤' }),
    ).toBeInTheDocument()
    expect(document.body.classList.contains('edit-mode')).toBe(true)
  })

  it('진입 → 텍스트 변경 → 저장: batch-save 호출 후 성공 처리', async () => {
    enterEditMode()
    render(<InlineEditHarness />)

    // 저장 버튼은 변경 전 비활성
    const saveBtn = screen.getByLabelText(/저장 \(0개 변경사항\)/)
    expect(saveBtn).toBeDisabled()

    // 텍스트 인라인 편집 → pendingChanges 반영
    editHeading('새로운 제목')
    expect(useEditStore.getState().isDirty).toBe(true)

    // 카운트 뱃지 + 저장 버튼 활성화
    const enabledSave = screen.getByLabelText(/저장 \(1개 변경사항\)/)
    expect(enabledSave).toBeEnabled()
    fireEvent.click(enabledSave)

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/edit/batch-save', {
        changes: [
          { section_id: SECTION_ID, field: FIELD, value: '새로운 제목' },
        ],
      }),
    )
    // 전체 성공 → 변경사항 초기화 + 성공 토스트
    await waitFor(() =>
      expect(useEditStore.getState().pendingChanges).toEqual({}),
    )
    expect(useEditStore.getState().isDirty).toBe(false)
    expect(toast.success).toHaveBeenCalled()
  })

  it('저장 실패 시 변경사항을 보존하고(롤백) 에러 토스트를 노출한다', async () => {
    postMock.mockRejectedValueOnce(new Error('network'))
    enterEditMode()
    render(<InlineEditHarness />)

    editHeading('실패할 제목')
    fireEvent.click(screen.getByLabelText(/저장 \(1개 변경사항\)/))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    // 실패 → pendingChanges 보존, 재시도 가능 상태 유지
    expect(
      Object.keys(useEditStore.getState().pendingChanges),
    ).toHaveLength(1)
    expect(useEditStore.getState().isDirty).toBe(true)
  })

  it('부분 실패 시 saved/failed 카운트 토스트 + 변경사항 보존', async () => {
    postMock.mockResolvedValueOnce({
      data: { data: { saved_count: 1, failed_count: 1, cache_purged: false } },
    })
    enterEditMode()
    render(<InlineEditHarness />)

    editHeading('부분 실패 제목')
    fireEvent.click(screen.getByLabelText(/저장 \(1개 변경사항\)/))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('1개 저장, 1개 실패'),
      ),
    )
    expect(useEditStore.getState().isDirty).toBe(true)
  })

  it('이탈 방지: 변경사항이 있는 상태로 편집 종료 시 확인 다이얼로그가 노출된다', () => {
    enterEditMode()
    render(<InlineEditHarness />)

    editHeading('저장 안 한 제목')
    fireEvent.click(screen.getByRole('button', { name: '편집 종료' }))

    expect(
      screen.getByRole('dialog', { name: '저장되지 않은 변경사항이 있습니다' }),
    ).toBeInTheDocument()
    // 아직 편집 모드 유지 (즉시 종료되지 않음)
    expect(useEditStore.getState().isEditMode).toBe(true)
  })

  it('변경사항이 없으면 편집 종료 시 즉시 종료된다 (다이얼로그 없음)', () => {
    enterEditMode()
    render(<InlineEditHarness />)

    fireEvent.click(screen.getByRole('button', { name: '편집 종료' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useEditStore.getState().isEditMode).toBe(false)
  })
})
