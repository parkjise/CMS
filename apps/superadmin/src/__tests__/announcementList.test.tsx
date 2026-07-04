import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Announcement } from '@/hooks/useAnnouncements'

const useAnnouncements = vi.fn()
const sendMutate = vi.fn()
const deleteMutate = vi.fn()
vi.mock('@/hooks/useAnnouncements', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useAnnouncements')>()
  return {
    ...actual,
    useAnnouncements: () => useAnnouncements(),
    useDeleteAnnouncement: () => ({ mutate: deleteMutate }),
    useSendAnnouncement: () => ({ mutateAsync: sendMutate }),
  }
})

import { AnnouncementList } from '@/components/announcements/AnnouncementList'

function ann(over: Partial<Announcement> & { id: string; title: string }): Announcement {
  return {
    content: '내용',
    type: 'INFO',
    target_type: 'ALL',
    target_plan: null,
    target_tenants: null,
    is_published: true,
    show_in_admin: true,
    send_email: false,
    send_kakao: false,
    published_at: '2026-07-01T00:00:00Z',
    expires_at: null,
    created_at: '2026-07-01T00:00:00Z',
    read_count: 0,
    ...over,
  }
}

describe('AnnouncementList (SA-05)', () => {
  beforeEach(() => {
    useAnnouncements.mockReset()
    sendMutate.mockReset().mockResolvedValue({ target_count: 5 })
    deleteMutate.mockReset()
  })

  it('공지 항목을 유형 뱃지·읽음 수와 함께 렌더', () => {
    useAnnouncements.mockReturnValue({
      data: [ann({ id: 'a1', title: '긴급 점검', type: 'URGENT', read_count: 12 })],
      isLoading: false,
      isError: false,
    })
    render(<AnnouncementList />)
    expect(screen.getByText('긴급 점검')).toBeInTheDocument()
    expect(screen.getByText('긴급')).toBeInTheDocument()
    expect(screen.getByText(/읽음 12명/)).toBeInTheDocument()
  })

  it('임시저장 공지에 뱃지 표시', () => {
    useAnnouncements.mockReturnValue({
      data: [ann({ id: 'a2', title: '초안', is_published: false })],
      isLoading: false,
      isError: false,
    })
    render(<AnnouncementList />)
    expect(screen.getByText('임시저장')).toBeInTheDocument()
  })

  it('발송 버튼 클릭 시 send 호출', async () => {
    const user = userEvent.setup()
    useAnnouncements.mockReturnValue({
      data: [ann({ id: 'a3', title: '공지' })],
      isLoading: false,
      isError: false,
    })
    render(<AnnouncementList />)
    await user.click(screen.getByRole('button', { name: /발송/ }))
    expect(sendMutate).toHaveBeenCalledWith('a3')
  })

  it('빈 목록 안내', () => {
    useAnnouncements.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<AnnouncementList />)
    expect(screen.getByText('작성된 공지가 없습니다.')).toBeInTheDocument()
  })
})
