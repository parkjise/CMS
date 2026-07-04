import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createMutate = vi.fn()
vi.mock('@/hooks/useAnnouncements', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useAnnouncements')>()
  return {
    ...actual,
    useCreateAnnouncement: () => ({ mutateAsync: createMutate, isPending: false }),
  }
})

vi.mock('@/hooks/useTenants', () => ({
  useTenants: () => ({ data: { items: [] } }),
}))

import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'

describe('AnnouncementForm (SA-05)', () => {
  beforeEach(() => createMutate.mockReset().mockResolvedValue({}))

  it('제목/내용 누락 시 검증 메시지 + 요청 안 함', async () => {
    const user = userEvent.setup()
    render(<AnnouncementForm />)
    await user.click(screen.getByRole('button', { name: '즉시 발송' }))
    expect(screen.getByRole('alert')).toHaveTextContent('제목과 내용')
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('즉시 발송 시 publish_now=true로 생성', async () => {
    const user = userEvent.setup()
    render(<AnnouncementForm />)
    await user.type(screen.getByLabelText('제목'), '정기 점검')
    await user.type(screen.getByLabelText('내용'), '점검 안내입니다.')
    await user.click(screen.getByRole('button', { name: '즉시 발송' }))
    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ title: '정기 점검', publish_now: true }),
      ),
    )
  })

  it('임시저장 시 publish_now=false로 생성', async () => {
    const user = userEvent.setup()
    render(<AnnouncementForm />)
    await user.type(screen.getByLabelText('제목'), '초안')
    await user.type(screen.getByLabelText('내용'), '내용')
    await user.click(screen.getByRole('button', { name: '임시저장' }))
    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ publish_now: false }),
      ),
    )
  })

  it('미리보기 클릭 시 프리뷰 노출', async () => {
    const user = userEvent.setup()
    render(<AnnouncementForm />)
    await user.type(screen.getByLabelText('제목'), '미리보기 테스트')
    await user.click(screen.getByRole('button', { name: '미리보기' }))
    const preview = screen.getByTestId('preview')
    expect(preview).toHaveTextContent('미리보기 테스트')
  })
})
