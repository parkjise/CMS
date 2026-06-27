import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ChatStreamHandlers } from '@/lib/aiChatStream'
import { AiEditPanel } from '@/components/ai/AiEditPanel'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

const streamMock = vi.fn()

vi.mock('@/lib/aiChatStream', () => ({
  streamChatEdit: (...args: unknown[]) => streamMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const resetStores = () => {
  useEditStore.setState({
    isEditMode: false,
    isAiPanelOpen: false,
    pendingChanges: {},
    isDirty: false,
  })
  useClientAuthStore.setState({ user: null, isLoggedIn: false })
  window.localStorage.clear()
}

const openPanel = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true, isAiPanelOpen: true })
}

describe('AiEditPanel', () => {
  beforeEach(() => {
    streamMock.mockReset()
    resetStores()
  })

  afterEach(() => {
    cleanup()
  })

  it('편집 모드가 아니거나 패널이 닫혀 있으면 렌더하지 않는다', () => {
    render(<AiEditPanel />)
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('열린 상태에서 인사 메시지와 입력창을 노출한다', () => {
    openPanel()
    render(<AiEditPanel />)
    expect(
      screen.getByRole('complementary', { name: 'AI 편집 어시스턴트' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('AI에게 요청할 내용')).toBeInTheDocument()
  })

  it('전송 시 사용자/AI 메시지와 텍스트 액션 버튼을 노출한다', async () => {
    streamMock.mockImplementation(
      async (_body: unknown, handlers: ChatStreamHandlers) => {
        handlers.onDelta('전문적으로 바꿨어요!')
        handlers.onActions([
          {
            action: 'update_text',
            section_id: 'sec-1',
            field: 'main_title',
            new_value: '전문 통증의학과',
          },
        ])
        handlers.onDone()
      },
    )
    openPanel()
    render(<AiEditPanel />)

    fireEvent.change(screen.getByLabelText('AI에게 요청할 내용'), {
      target: { value: '메인 배너를 전문적으로' },
    })
    fireEvent.click(screen.getByRole('button', { name: '전송' }))

    await waitFor(() =>
      expect(screen.getByText('메인 배너를 전문적으로')).toBeInTheDocument(),
    )
    expect(screen.getByText('전문적으로 바꿨어요!')).toBeInTheDocument()
    expect(screen.getByText('전문 통증의학과')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '적용' })).toBeInTheDocument()
  })

  it('텍스트 액션 [적용] 시 editStore에 변경사항이 반영된다', async () => {
    document.body.innerHTML +=
      '<h1 data-section-id="sec-1" data-field="main_title">기존</h1>'
    streamMock.mockImplementation(
      async (_body: unknown, handlers: ChatStreamHandlers) => {
        handlers.onActions([
          {
            action: 'update_text',
            section_id: 'sec-1',
            field: 'main_title',
            new_value: '전문 통증의학과',
          },
        ])
        handlers.onDone()
      },
    )
    openPanel()
    render(<AiEditPanel />)

    fireEvent.change(screen.getByLabelText('AI에게 요청할 내용'), {
      target: { value: '바꿔줘' },
    })
    fireEvent.click(screen.getByRole('button', { name: '전송' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '적용' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    const change =
      useEditStore.getState().pendingChanges['sec-1:main_title']
    expect(change?.new_value).toBe('전문 통증의학과')
    expect(useEditStore.getState().isDirty).toBe(true)
  })

  it('닫기 버튼은 패널을 닫는다', () => {
    openPanel()
    render(<AiEditPanel />)
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }))
    expect(useEditStore.getState().isAiPanelOpen).toBe(false)
  })
})
