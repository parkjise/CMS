import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as api from '@/lib/memberAuth'
import { MemberApiError } from '@/lib/memberAuth'
import { useMemberStore } from '@/lib/memberStore'
import { PENDING_SIGNUP_KEY } from '@/lib/memberSocial'
import MemberLoginForm from '@/components/member/MemberLoginForm'
import JoinForm from '@/components/member/JoinForm'
import JoinSocialForm from '@/components/member/JoinSocialForm'
import FindEmailForm from '@/components/member/FindEmailForm'
import FindPasswordForm from '@/components/member/FindPasswordForm'
import ResetPasswordForm from '@/components/member/ResetPasswordForm'
import PhoneVerification from '@/components/member/PhoneVerification'
import MemberAccountLinks from '@/components/member/MemberAccountLinks'

/** 방문자 회원 화면 (T-113, 기획서 16.3 ~ 16.6) */

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))

vi.mock('@/lib/memberAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/memberAuth')>()
  return {
    ...actual,
    fetchAuthOptions: vi.fn(),
    checkEmail: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    sendPhoneCode: vi.fn(),
    verifyPhoneCode: vi.fn(),
    findEmail: vi.fn(),
    forgotPassword: vi.fn(),
    checkResetToken: vi.fn(),
    resetPassword: vi.fn(),
    completeSocialSignup: vi.fn(),
  }
})
const mocked = vi.mocked(api)

const session = {
  access_token: 'access-1',
  member: { id: 'm1', name: '홍길동', email: 'hong@example.com' },
}
const sendResult = (seconds = 180) => ({
  verification_id: 'v1',
  expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
  resend_after_seconds: 60,
  debug_code: '123456',
})

const renderUi = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  )

/** 필수 표시(*)가 붙은 라벨도 같은 이름으로 찾는다 */
const label = (text: RegExp | string) =>
  typeof text === 'string' ? new RegExp(`^${text}\\*?$`) : text

const type = (text: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label(text)), { target: { value } })

/** 발송 응답 뒤에 나타나는 인증번호 입력 */
const typeCode = async (value: string) =>
  fireEvent.change(await screen.findByLabelText('인증번호 6자리'), { target: { value } })

/** 카운트다운은 1초마다 다음 타이머를 거는 구조라 1초씩 진행한다 */
const tick = async (seconds: number) => {
  for (let i = 0; i < seconds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
  }
}

/** 휴대폰 인증까지 끝낸다 */
const verifyPhone = async (phone = '010-1234-5678') => {
  type(/휴대폰 번호/, phone)
  fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
  await typeCode('123456')
  fireEvent.click(await screen.findByRole('button', { name: '확인' }))
  expect(await screen.findByText('✓ 인증 완료')).toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  useMemberStore.setState({ slug: null, member: null, accessToken: null, status: 'idle' })
  mocked.fetchAuthOptions.mockResolvedValue({ social_login: false, providers: [], reservations: false })
  mocked.sendPhoneCode.mockResolvedValue(sendResult())
  mocked.verifyPhoneCode.mockResolvedValue({ verification_id: 'v1', verified: true })
})
afterEach(() => vi.useRealTimers())

describe('PhoneVerification', () => {
  const setup = () => {
    const onVerified = vi.fn()
    let phone = ''
    const view = renderUi(
      <PhoneVerification
        slug="clinic"
        purpose="REGISTER"
        phone="010-1234-5678"
        onPhoneChange={(v) => (phone = v)}
        verified={false}
        onVerified={onVerified}
        onReset={vi.fn()}
      />,
    )
    return { onVerified, view, getPhone: () => phone }
  }

  it('발송 → 3분 타이머 · 재발송 60초 · 개발용 코드', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
    expect(await screen.findByLabelText('남은 시간')).toHaveTextContent(/^(3:00|2:59)$/)
    expect(screen.getByRole('button', { name: /재발송 \(\d+초\)/ })).toBeDisabled()
    expect(screen.getByText('개발용 인증번호: 123456')).toBeInTheDocument()
    expect(mocked.sendPhoneCode).toHaveBeenCalledWith('clinic', '010-1234-5678', 'REGISTER')

    await tick(61)
    expect(screen.getByRole('button', { name: '재발송' })).toBeEnabled()
    await tick(120)
    expect(screen.getByRole('alert')).toHaveTextContent('인증번호가 만료되었습니다')
  })

  it('오입력 → 남은 시도 표시, 성공 → onVerified', async () => {
    const { onVerified } = setup()
    mocked.verifyPhoneCode.mockRejectedValueOnce(
      new MemberApiError('인증번호가 일치하지 않습니다', 'INVALID_CODE', 400, 'code', [
        { remaining_attempts: 4 },
      ]),
    )
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await typeCode('000000')
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('남은 시도 4회')
    await typeCode('123456')
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('v1'))
  })

  it('재요청 대기 429 → 남은 초만큼 버튼 잠금', async () => {
    mocked.sendPhoneCode.mockRejectedValueOnce(
      new MemberApiError('잠시 후 다시 요청해주세요', 'RATE_LIMIT_EXCEEDED', 429, null, [
        { retry_after_seconds: 42 },
      ]),
    )
    setup()
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 요청해주세요')
    expect(screen.getByRole('button', { name: /재발송 \(4[12]초\)/ })).toBeDisabled()
  })
})

describe('MemberLoginForm', () => {
  it('검증 문구 · 성공 시 next 로 이동 + 세션 저장', async () => {
    mocked.login.mockResolvedValue(session)
    renderUi(<MemberLoginForm slug="clinic" next="/clinic/about" />)
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findAllByText('필수 입력 항목입니다')).toHaveLength(2)

    type('이메일', 'hong@example.com')
    type('비밀번호', 'abcd1234')
    fireEvent.click(screen.getByLabelText('로그인 상태 유지'))
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clinic/about'))
    expect(mocked.login).toHaveBeenCalledWith('clinic', {
      email: 'hong@example.com',
      password: 'abcd1234',
      remember_me: true,
    })
    expect(useMemberStore.getState().member?.id).toBe('m1')
  })

  it('잠금 → 버튼 비활성 + 남은 시간', async () => {
    mocked.login.mockRejectedValue(
      new MemberApiError('30분 후에 다시 시도해주세요', 'ACCOUNT_LOCKED', 429, null, [
        { retry_after_seconds: 1799 },
      ]),
    )
    renderUi(<MemberLoginForm slug="clinic" />)
    type('이메일', 'hong@example.com')
    type('비밀번호', 'wrong1234')
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByLabelText('남은 잠금 시간')).toHaveTextContent('(29:59)')
    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled()
  })

  it('소셜 버튼은 기능 플래그가 켜졌을 때만', async () => {
    mocked.fetchAuthOptions.mockResolvedValue({ social_login: true, providers: ['KAKAO', 'NAVER'], reservations: false })
    renderUi(<MemberLoginForm slug="clinic" />)
    expect(await screen.findByRole('button', { name: '카카오로 로그인' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '네이버로 로그인' })).toBeInTheDocument()
  })

  it('플래그 OFF 면 소셜 버튼 없음', async () => {
    renderUi(<MemberLoginForm slug="clinic" />)
    await waitFor(() => expect(mocked.fetchAuthOptions).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /카카오/ })).not.toBeInTheDocument()
  })
})

describe('JoinForm', () => {
  const fill = () => {
    type('이름', '홍길동')
    type('이메일', 'hong@example.com')
    type('비밀번호', 'abcd1234')
    type('비밀번호 확인', 'abcd1234')
  }

  it('이메일 중복 확인 1초 디바운스 · 사용 중 표시', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocked.checkEmail.mockResolvedValue({ email: 'hong@example.com', available: false })
    renderUi(<JoinForm slug="clinic" />)
    type('이메일', 'hong@example.com')
    expect(mocked.checkEmail).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(await screen.findByText('이미 사용 중인 이메일입니다')).toBeInTheDocument()
    expect(mocked.checkEmail).toHaveBeenCalledWith('clinic', 'hong@example.com')
  })

  it('비밀번호 강도 표시', () => {
    renderUi(<JoinForm slug="clinic" />)
    type('비밀번호', 'abc')
    const items = screen.getByRole('list', { name: '비밀번호 조건' }).querySelectorAll('li')
    expect([...items].map((li) => li.dataset.ok)).toEqual(['false', 'true', 'false'])
  })

  it('휴대폰 인증 없이 가입 불가 → 인증 후 가입 · 이동', async () => {
    mocked.checkEmail.mockResolvedValue({ email: 'hong@example.com', available: true })
    mocked.register.mockResolvedValue(session)
    renderUi(<JoinForm slug="clinic" next="/clinic/notice" />)
    fill()
    fireEvent.click(screen.getByLabelText('이용약관 동의 (필수)'))
    fireEvent.click(screen.getByLabelText('개인정보처리방침 (필수)'))
    type(/휴대폰 번호/, '010-1234-5678')
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
    expect(await screen.findByText('휴대폰 인증을 완료해주세요')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await typeCode('123456')
    fireEvent.click(await screen.findByRole('button', { name: '확인' }))
    expect(await screen.findByText('✓ 인증 완료')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clinic/notice'))
    expect(mocked.register).toHaveBeenCalledWith(
      'clinic',
      expect.objectContaining({ phone_verification_id: 'v1', birth_date: null, terms_agree: true }),
    )
  })

  it('서버 필드 오류는 해당 입력 아래에', async () => {
    mocked.checkEmail.mockResolvedValue({ email: 'hong@example.com', available: true })
    mocked.register.mockRejectedValue(
      new MemberApiError('휴대폰 인증을 완료해주세요', 'PHONE_NOT_VERIFIED', 400, 'phone'),
    )
    renderUi(<JoinForm slug="clinic" />)
    fill()
    fireEvent.click(screen.getByLabelText('이용약관 동의 (필수)'))
    fireEvent.click(screen.getByLabelText('개인정보처리방침 (필수)'))
    await verifyPhone()
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
    expect(await screen.findByText('휴대폰 인증을 완료해주세요')).toBeInTheDocument()
  })
})

describe('JoinSocialForm', () => {
  it('콜백 정보가 없으면 다시 로그인 안내', async () => {
    renderUi(<JoinSocialForm slug="clinic" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('소셜 로그인을 다시 시도해주세요')
  })

  it('이메일 미제공이면 이메일 입력 → 가입 완료 → 원래 페이지', async () => {
    window.sessionStorage.setItem(
      PENDING_SIGNUP_KEY,
      JSON.stringify({
        slug: 'clinic',
        provider: 'KAKAO',
        signupToken: 'signup-1',
        emailRequired: true,
        suggestedName: '카카오친구',
        returnTo: '/clinic/about',
      }),
    )
    mocked.completeSocialSignup.mockResolvedValue({ ...session, return_to: '/clinic/about' })
    renderUi(<JoinSocialForm slug="clinic" />)
    expect(await screen.findByText('카카오 계정으로 가입을 완료해주세요.')).toBeInTheDocument()
    type('이메일', 'typed@example.com')
    fireEvent.click(screen.getByLabelText('이용약관 동의 (필수)'))
    fireEvent.click(screen.getByLabelText('개인정보처리방침 (필수)'))
    await verifyPhone()
    fireEvent.click(screen.getByRole('button', { name: '가입 완료하기' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clinic/about'))
    expect(mocked.completeSocialSignup).toHaveBeenCalledWith(
      'clinic',
      expect.objectContaining({ signup_token: 'signup-1', email: 'typed@example.com', name: '카카오친구' }),
    )
    expect(window.sessionStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull()
  })
})

describe('FindEmailForm · FindPasswordForm · ResetPasswordForm', () => {
  it('이메일 찾기 결과 · 없을 때 안내', async () => {
    mocked.findEmail
      .mockRejectedValueOnce(new MemberApiError('없음', 'NOT_FOUND', 404))
      .mockResolvedValueOnce({
        accounts: [
          { masked_email: 'ho**@example.com', social_provider: null, created_at: '2026-10-01' },
          { masked_email: 'ka***@example.com', social_provider: 'KAKAO', created_at: '2026-10-02' },
        ],
      })
    renderUi(<FindEmailForm slug="clinic" />)
    type('이름', '홍길동')
    await verifyPhone()
    fireEvent.click(screen.getByRole('button', { name: '이메일 찾기' }))
    expect(await screen.findByText('입력하신 정보와 일치하는 계정을 찾을 수 없습니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '이메일 찾기' }))
    expect(await screen.findByText('ho**@example.com')).toBeInTheDocument()
    expect(screen.getByText('(카카오 가입)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '비밀번호도 찾기' })).toHaveAttribute(
      'href',
      '/clinic/member/find-password',
    )
  })

  it('재설정 링크 발송 화면 · 재발송 대기 · 개발용 링크', async () => {
    mocked.forgotPassword.mockResolvedValue({
      masked_email: 'ho**@example.com',
      expires_in_minutes: 30,
      resend_after_seconds: 60,
      debug_reset_url: 'http://localhost:3000/clinic/member/reset-password?token=t1',
    })
    renderUi(<FindPasswordForm slug="clinic" />)
    type('이메일', 'hong@example.com')
    await verifyPhone()
    fireEvent.click(screen.getByRole('button', { name: '재설정 링크 보내기' }))
    expect(await screen.findByText(/ho\*\*@example.com 으로 비밀번호 재설정 링크를 보냈어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /재발송하기 \(\d+초\)/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: '개발용: 재설정 링크 열기' })).toHaveAttribute(
      'href',
      'http://localhost:3000/clinic/member/reset-password?token=t1',
    )
  })

  it('만료된 링크 안내', async () => {
    mocked.checkResetToken.mockRejectedValue(new MemberApiError('만료', 'TOKEN_EXPIRED', 400))
    renderUi(<ResetPasswordForm slug="clinic" token="old" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('유효하지 않거나 만료된 링크입니다.')
    expect(screen.getByRole('link', { name: '비밀번호 찾기 다시 시도' })).toBeInTheDocument()
  })

  it('새 비밀번호 저장 → 완료 → 3초 후 로그인', async () => {
    mocked.checkResetToken.mockResolvedValue({ valid: true, masked_email: 'ho**@example.com' })
    mocked.resetPassword.mockResolvedValue({ reset: true })
    renderUi(<ResetPasswordForm slug="clinic" token="t1" />)
    expect(await screen.findByText('ho**@example.com 계정의 새 비밀번호를 입력해주세요.')).toBeInTheDocument()
    type('새 비밀번호', 'newpass99')
    type('새 비밀번호 확인', 'newpass99')
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경하기' }))
    expect(await screen.findByText('✓ 비밀번호가 변경되었습니다.')).toBeInTheDocument()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clinic/member/login'), {
      timeout: 4500,
    })
  })
})

describe('MemberAccountLinks', () => {
  it('비로그인: 로그인 · 회원가입 / 로그인: 마이페이지 · 로그아웃', () => {
    const { rerender } = render(<MemberAccountLinks slug="clinic" linkClassName="link" />)
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/clinic/member/login')
    expect(screen.getByRole('link', { name: '회원가입' })).toBeInTheDocument()

    act(() => useMemberStore.getState().setSession('clinic', session))
    rerender(<MemberAccountLinks slug="clinic" linkClassName="link" />)
    expect(screen.getByRole('link', { name: '마이페이지' })).toHaveAttribute(
      'href',
      '/clinic/member/mypage',
    )
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })

  it('다른 테넌트 세션은 무시', () => {
    act(() => useMemberStore.getState().setSession('other', session))
    render(<MemberAccountLinks slug="clinic" linkClassName="link" />)
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
  })
})
