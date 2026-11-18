import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Post } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { PostAnswerPanel } from '@/components/boards/PostAnswerPanel'
import { BoardDesignPreview } from '@/components/boards/BoardDesignPreview'
import { useAuthStore } from '@/stores/authStore'

const { put, toast } = vi.hoisted(() => ({
  put: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), put, patch: vi.fn(), post: vi.fn() } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const post = {
  id: 'p1',
  board_id: 'b1',
  title: '주차 되나요?',
  status: 'PUBLISHED',
  is_pinned: false,
  is_secret: false,
  answer: null,
  answered_at: null,
} as unknown as Post

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role } } as unknown as Parameters<typeof useAuthStore.setState>[0])

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
})

describe('문의형 답변 (T-219)', () => {
  it('답변을 저장하면 완료로 바뀌고, 지우면 대기', async () => {
    put.mockResolvedValueOnce({
      data: { data: { ...post, answer: '건물 뒤에 있어요', answered_at: '2026-11-18T01:00:00Z' } },
    })
    renderWithQuery(<PostAnswerPanel boardId="b1" post={post} />)
    expect(screen.getByText('답변 대기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '답변 저장' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('답변 내용'), '건물 뒤에 있어요')
    await userEvent.click(screen.getByRole('button', { name: '답변 저장' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/v1/boards/b1/posts/p1/answer', { answer: '건물 뒤에 있어요' }),
    )
    expect(await screen.findByText(/답변 완료/)).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('답변을 저장했습니다.')

    put.mockResolvedValueOnce({ data: { data: { ...post } } })
    await userEvent.click(screen.getByRole('button', { name: '답변 지우기' }))
    await waitFor(() => expect(put).toHaveBeenLastCalledWith('/v1/boards/b1/posts/p1/answer', { answer: '' }))
    expect(await screen.findByText('답변 대기')).toBeInTheDocument()
  })

  it('비밀글 안내 · 저장 실패 메시지', async () => {
    put.mockRejectedValueOnce(new Error('down'))
    renderWithQuery(<PostAnswerPanel boardId="b1" post={{ ...post, is_secret: true }} />)
    expect(screen.getByText(/답변도 글쓴이와 관리자만/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('답변 내용'), '답')
    await userEvent.click(screen.getByRole('button', { name: '답변 저장' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  it('보기 전용 관리자는 고칠 수 없다', () => {
    setRole('TENANT_VIEWER')
    renderWithQuery(<PostAnswerPanel boardId="b1" post={{ ...post, answer: '답', answered_at: '2026-11-18T01:00:00Z' }} />)
    expect(screen.getByLabelText('답변 내용')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '답변 저장' })).not.toBeInTheDocument()
  })

  it('디자인 미리보기에 답변 상태 배지', () => {
    renderWithQuery(
      <BoardDesignPreview
        name="묻고 답하기"
        type="QNA"
        design={{
          columns: 3,
          image_ratio: '4:3',
          show_date: true,
          show_image: true,
          show_summary: true,
          faq_single_open: false,
          faq_first_open: false,
        }}
      />,
    )
    expect(screen.getAllByText('답변 완료').length).toBeGreaterThan(0)
    expect(screen.getAllByText('답변 대기').length).toBeGreaterThan(0)
  })
})
