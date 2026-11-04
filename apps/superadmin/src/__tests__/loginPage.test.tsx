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

  const login = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByPlaceholderText('admin@cms.io'), 'a@cms.io')
    await user.type(screen.getByPlaceholderText('••••••••'), 'pw')
    await user.click(screen.getByRole('button', { name: '로그인' }))
  }

  it('2FA 계정 — 코드 입력 뒤에야 로그인된다', async () => {
    const user = userEvent.setup()
    post.mockResolvedValueOnce({
      data: { data: { requires_2fa: true, challenge_token: 'ch' } },
    })
    render(<LoginPage />)
    await login(user)
    await screen.findByText('2단계 인증')
    expect(setAuth).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.getByRole('alert')).toHaveTextContent('6자리')

    post.mockResolvedValueOnce({
      data: { data: { access_token: 'tok', user: { id: 'u1' } } },
    })
    await user.type(screen.getByLabelText('인증 코드'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(setAuth).toHaveBeenCalledWith('tok', { id: 'u1' }))
    expect(post).toHaveBeenLastCalledWith('/v1/auth/verify-2fa', {
      challenge_token: 'ch',
      code: '123456',
    })
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('틀린 코드 — 안내를 보여 주고 입력을 비운다', async () => {
    const user = userEvent.setup()
    post.mockResolvedValueOnce({
      data: { data: { requires_2fa: true, challenge_token: 'ch' } },
    })
    render(<LoginPage />)
    await login(user)
    await screen.findByText('2단계 인증')
    post.mockRejectedValueOnce(new Error('bad'))
    await user.type(screen.getByLabelText('인증 코드'), '000000')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('인증 코드')).toHaveValue('')
    expect(setAuth).not.toHaveBeenCalled()
  })

  it('첫 로그인 — QR 과 키를 보여 주고 등록 확인으로 로그인', async () => {
    const user = userEvent.setup()
    post
      .mockResolvedValueOnce({
        data: { data: { requires_2fa: false, requires_2fa_setup: true, challenge_token: 'ch' } },
      })
      .mockResolvedValueOnce({
        data: { data: { secret: 'ABC234', otpauth_uri: 'otpauth://totp/x?secret=ABC234' } },
      })
    render(<LoginPage />)
    await login(user)
    expect(await screen.findByText('ABC234')).toBeInTheDocument()
    expect(screen.getByTitle('인증 앱 등록 QR 코드')).toBeInTheDocument()
    expect(post).toHaveBeenLastCalledWith('/v1/auth/2fa/enroll', { challenge_token: 'ch' })

    post.mockResolvedValueOnce({
      data: { data: { access_token: 'tok', user: { id: 'u1' } } },
    })
    await user.type(screen.getByLabelText('인증 코드'), '654321')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(setAuth).toHaveBeenCalled())
    expect(post).toHaveBeenLastCalledWith('/v1/auth/2fa/enroll/confirm', {
      challenge_token: 'ch',
      code: '654321',
    })
  })

  it('처음으로 — 비밀번호 화면으로 돌아간다', async () => {
    const user = userEvent.setup()
    post.mockResolvedValueOnce({
      data: { data: { requires_2fa: true, challenge_token: 'ch' } },
    })
    render(<LoginPage />)
    await login(user)
    await screen.findByText('2단계 인증')
    await user.click(screen.getByRole('button', { name: '처음으로' }))
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })
})
