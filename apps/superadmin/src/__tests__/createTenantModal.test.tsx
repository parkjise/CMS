import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutateAsync = vi.fn()
vi.mock('@/hooks/useTenants', () => ({
  useCreateTenant: () => ({ mutateAsync, isPending: false }),
}))

import { CreateTenantModal } from '@/components/tenants/CreateTenantModal'

describe('CreateTenantModal', () => {
  beforeEach(() => mutateAsync.mockReset())

  it('필수 입력 누락 시 검증 메시지 + 요청 안 함', async () => {
    const user = userEvent.setup()
    render(<CreateTenantModal open onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '생성' }))
    expect(screen.getByRole('alert')).toHaveTextContent('필수 항목')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('유효 입력 시 생성 요청', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue({})
    const onClose = vi.fn()
    render(<CreateTenantModal open onClose={onClose} />)

    await user.type(screen.getByLabelText('사업체명'), '새상점')
    await user.type(screen.getByLabelText('slug (URL 식별자)'), 'newshop')
    await user.type(screen.getByLabelText('관리자 이메일'), 'a@shop.com')
    await user.type(screen.getByLabelText('관리자 초기 비밀번호'), 'password123')
    await user.click(screen.getByRole('button', { name: '생성' }))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: '새상점', slug: 'newshop' }),
      ),
    )
    expect(onClose).toHaveBeenCalled()
  })
})
