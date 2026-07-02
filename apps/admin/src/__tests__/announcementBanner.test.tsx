import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnouncementBanner } from '@/components/layout/AnnouncementBanner'
import { useFeatureStore } from '@/stores/featureStore'
import type { Announcement } from '@/stores/featureStore'

const ann = (over: Partial<Announcement> & { id: string }): Announcement => ({
  title: '공지 제목',
  type: 'INFO',
  content: '내용',
  is_read: false,
  ...over,
})

describe('AnnouncementBanner', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  afterEach(() => useFeatureStore.getState().reset())

  it('미읽은 공지가 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<AnnouncementBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('미읽은 공지를 유형 정보와 함께 노출', () => {
    useFeatureStore.setState({
      announcements: [ann({ id: 'a1', title: '긴급 점검', type: 'URGENT' })],
    })
    render(<AnnouncementBanner />)
    const banner = screen.getByText('긴급 점검').closest('[data-type]')
    expect(banner).toHaveAttribute('data-type', 'URGENT')
  })

  it('is_read=true 공지는 노출하지 않는다', () => {
    useFeatureStore.setState({
      announcements: [ann({ id: 'a1', title: '읽은 공지', is_read: true })],
    })
    const { container } = render(<AnnouncementBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('[확인] 클릭 시 목록에서 제거된다', async () => {
    const user = userEvent.setup()
    useFeatureStore.setState({
      announcements: [ann({ id: 'a1', title: '확인 대상' })],
    })
    render(<AnnouncementBanner />)

    await user.click(screen.getByRole('button', { name: /확인/ }))

    await waitFor(() => {
      expect(screen.queryByText('확인 대상')).not.toBeInTheDocument()
    })
    expect(useFeatureStore.getState().announcements).toHaveLength(0)
  })
})
