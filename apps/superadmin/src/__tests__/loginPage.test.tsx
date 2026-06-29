import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const navigate = vi.fn()
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
}))

const post = vi.fn()
vi.mock('@/lib/superApi', () => ({
  superApi: { post: (...args: unknown[]) => post(...args) },
}))

const setAuth = vi.fn()
vi.mock('@/stores/superAuthStore', () => ({
  useSuperAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ setAuth }),
}))

import { LoginPage } from '@/pages/LoginPage'

describe('LoginPage (T-084)', () => {
  beforeEach(() => {
    navigate.mockClear()
    post.mockClear()
    setAuth.mockClear()
  })

  it('로그인 폼을 렌더링한다', () => {
    render(<LoginPage />)
    expect(screen.getByText('CMS 슈퍼 어드민')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('admin@cms.io')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('빈 입력 시 검증 메시지를 표시한다', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(screen.getByRole('alert')).toHaveTextContent('입력하세요')
    expect(post).not.toHaveBeenCalled()
  })

  it('로그인 성공 시 setAuth 후 대시보드로 이동', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({
      data: {
        data: { access_token: 'tok', user: { id: 'u1', role: 'SUPER_ADMIN' } },
      },
    })
    render(<LoginPage />)
    await user.type(screen.getByPlaceholderText('admin@cms.io'), 'a@cms.io')
    await user.type(screen.getByPlaceholderText('••••••••'), 'pw')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() => expect(setAuth).toHaveBeenCalledWith('tok', expect.any(Object)))
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('로그인 실패 시 에러 메시지를 표시한다', async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(new Error('401'))
    render(<LoginPage />)
    await user.type(screen.getByPlaceholderText('admin@cms.io'), 'a@cms.io')
    await user.type(screen.getByPlaceholderText('••••••••'), 'bad')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('올바르지 않습니다'),
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})
