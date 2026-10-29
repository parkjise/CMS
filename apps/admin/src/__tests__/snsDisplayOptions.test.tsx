import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SnsSettings } from '@/hooks/useSns'

// SNS 노출 위치 설정 (T-038-A, 기획서 AD-03) — 예전엔 잠긴 placeholder

const mutateAsync = vi.fn()
const snsData = vi.fn()
const snsLoading = vi.fn(() => false)
vi.mock('@/hooks/useSns', () => ({
  useSnsSettings: () => ({ data: snsData(), isLoading: snsLoading() }),
  useUpdateSns: () => ({ mutateAsync, isPending: false }),
  useTestSnsUrl: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ data: undefined, isLoading: true }),
}))
vi.mock('@/components/sns/NotificationSettingsCard', () => ({
  NotificationSettingsCard: () => null,
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: vi.fn(), error: vi.fn() } }
})

import { SnsPage } from '@/pages/SnsPage'

const settings = (over: Partial<SnsSettings> = {}): SnsSettings => ({
  id: 's1',
  tenant_id: 't1',
  kakao_url: 'https://pf.kakao.com/_a',
  instagram_url: null,
  facebook_url: null,
  youtube_url: null,
  blog_url: null,
  naver_url: null,
  show_in_footer: true,
  show_floating: true,
  floating_position: 'BOTTOM_RIGHT',
  updated_at: '2026-10-28T00:00:00Z',
  ...over,
})

describe('SNS 노출 위치', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({})
    snsData.mockReset()
    snsLoading.mockReset().mockReturnValue(false)
  })

  it('저장된 값이 오기 전에는 노출 위치를 바꿀 수 없다 — 늦게 온 값이 덮어쓰지 않게 (T-036-A)', () => {
    snsLoading.mockReturnValue(true)
    snsData.mockReturnValue(undefined)
    render(<SnsPage />)
    expect(screen.getByLabelText('푸터(Footer)에 SNS 아이콘 노출')).toBeDisabled()
    expect(screen.getByLabelText('카카오톡 플로팅 버튼으로 노출')).toBeDisabled()
  })

  it('저장된 값을 보여 주고, 바꿔서 저장하면 함께 보낸다', async () => {
    const user = userEvent.setup()
    snsData.mockReturnValue(settings())
    render(<SnsPage />)

    const footer = screen.getByLabelText('푸터(Footer)에 SNS 아이콘 노출')
    expect(footer).toBeChecked()
    await user.click(footer)
    await user.selectOptions(screen.getByLabelText('플로팅 버튼 위치'), 'BOTTOM_LEFT')
    await user.click(screen.getByRole('button', { name: /저장/ }))

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kakao_url: 'https://pf.kakao.com/_a',
        show_in_footer: false,
        show_floating: true,
        floating_position: 'BOTTOM_LEFT',
      }),
    )
  })

  it('플로팅을 끄면 위치 선택이 잠긴다', async () => {
    const user = userEvent.setup()
    snsData.mockReturnValue(settings())
    render(<SnsPage />)
    await user.click(screen.getByLabelText('카카오톡 플로팅 버튼으로 노출'))
    expect(screen.getByLabelText('플로팅 버튼 위치')).toBeDisabled()
  })

  it('카카오톡 주소가 없으면 플로팅 안내', () => {
    snsData.mockReturnValue(settings({ kakao_url: null }))
    render(<SnsPage />)
    expect(screen.getByRole('note')).toHaveTextContent('카카오톡 채널 주소를 넣어야')
  })

  it('설정이 아직 없으면 기본값(모두 노출 · 우측 하단)', () => {
    snsData.mockReturnValue(null)
    render(<SnsPage />)
    expect(screen.getByLabelText('푸터(Footer)에 SNS 아이콘 노출')).toBeChecked()
    expect(screen.getByLabelText('카카오톡 플로팅 버튼으로 노출')).toBeChecked()
    expect(screen.getByLabelText('플로팅 버튼 위치')).toHaveValue('BOTTOM_RIGHT')
  })
})
