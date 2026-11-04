import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const create = vi.fn()
const remove = vi.fn()
vi.mock('@/hooks/useTenant', () => ({
  useTenantViewers: () => ({
    data: [{ id: 'v1', email: 'old@example.com', last_login_at: null, created_at: '2026-11-04' }],
  }),
  useCreateViewer: () => ({ mutateAsync: create, isPending: false }),
  useRemoveViewer: () => ({ mutateAsync: remove, isPending: false }),
}))

import { ViewersSection } from '@/components/tenants/ViewersSection'

// 보기 전용 계정 추가 · 삭제 (T-130)
describe('ViewersSection', () => {
  beforeEach(() => {
    create.mockReset()
    remove.mockReset()
  })

  it('계정을 추가하면 임시 비밀번호를 보여 준다', async () => {
    create.mockResolvedValue({ viewer: { email: 'new@example.com' }, temporary_password: 'temp-pw' })
    const user = userEvent.setup()
    render(<ViewersSection tenantId="t1" />)
    await user.type(screen.getByLabelText(/이메일/), 'new@example.com')
    await user.click(screen.getByRole('button', { name: '계정 추가' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('new@example.com'))
    expect(await screen.findByRole('status')).toHaveTextContent('temp-pw')
  })

  it('삭제 버튼으로 계정을 지운다', async () => {
    remove.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ViewersSection tenantId="t1" />)
    await user.click(screen.getByRole('button', { name: 'old@example.com 삭제' }))
    expect(remove).toHaveBeenCalledWith('v1')
  })
})
