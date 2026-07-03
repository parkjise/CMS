import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createMutate = vi.fn()
const updateMutate = vi.fn()
vi.mock('@/hooks/useFeatures', () => ({
  useCreateFeature: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateFeature: () => ({ mutateAsync: updateMutate, isPending: false }),
}))

import { CreateFeatureModal } from '@/components/features/CreateFeatureModal'

describe('CreateFeatureModal', () => {
  beforeEach(() => {
    createMutate.mockReset()
    updateMutate.mockReset()
  })

  it('key/name 누락 시 검증 메시지 + 요청 안 함', async () => {
    const user = userEvent.setup()
    render(<CreateFeatureModal open onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByRole('alert')).toHaveTextContent('필수')
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('유효 입력 시 생성 요청', async () => {
    const user = userEvent.setup()
    createMutate.mockResolvedValue({})
    const onClose = vi.fn()
    render(<CreateFeatureModal open onClose={onClose} />)

    await user.type(screen.getByLabelText('key (UPPER_SNAKE_CASE)'), 'AI_REPORT')
    await user.type(screen.getByLabelText('이름'), 'AI 리포트')
    await user.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'AI_REPORT', name: 'AI 리포트' }),
      ),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('수정 모드에서는 key 비활성 + 저장 시 update 호출', async () => {
    const user = userEvent.setup()
    updateMutate.mockResolvedValue({})
    render(
      <CreateFeatureModal
        open
        onClose={() => {}}
        feature={{
          id: 'f1',
          key: 'AI_REPORT',
          name: 'AI 리포트',
          description: null,
          category: 'AI',
          menu_path: null,
          menu_icon: null,
          menu_label: null,
          menu_position: 99,
          default_enabled: false,
          required_plan: 'PREMIUM',
          is_beta: false,
          is_active: true,
          release_note: null,
          released_at: null,
          created_at: '2026-07-01T00:00:00Z',
          enabled_tenant_count: 0,
        }}
      />,
    )
    expect(screen.getByLabelText('key (UPPER_SNAKE_CASE)')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(updateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'f1' }),
      ),
    )
  })
})
