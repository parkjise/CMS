import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as authApi from '@/lib/memberAuth'
import { MemberApiError } from '@/lib/memberAuth'
import * as account from '@/lib/memberAccount'
import { useMemberStore } from '@/lib/memberStore'
import {
  FindEmailScreen,
  JoinScreen,
  LoginScreen,
  ResetPasswordScreen,
} from '@/templates/hospital-a/components/member/AuthScreens'
import { MypageScreen } from '@/templates/hospital-a/components/member/MypageScreen'
import { MemberScreen } from '@/templates/hospital-a/components/member/MemberScreen'

/** hospital-a 회원 화면 — 목업 마크업 + 공통 로직 (T-124) */

const replace = vi.fn()
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/clinic/member/mypage',
  useSearchParams: () => search,
}))
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
    checkResetToken: vi.fn(),
  }
})
vi.mock('@/lib/memberAccount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/memberAccount')>()
  return {
    ...actual,
    getMe: vi.fn(),
    listReservations: vi.fn(),
    getNotifications: vi.fn(),
    listInquiries: vi.fn(),
    listSocialAccounts: vi.fn(),
  }
})
const auth = vi.mocked(authApi)
const api = vi.mocked(account)

const session = {
  access_token: 'access-1',
  member: { id: 'm1', name: '홍길동', email: 'hong@example.com' },
}
const renderUi = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams()
  window.localStorage.clear()
  useMemberStore.setState({ slug: null, member: null, accessToken: null, status: 'ready' })
  auth.fetchAuthOptions.mockResolvedValue({
    enabled: true,
    social_login: true,
    providers: ['KAKAO', 'NAVER'],
    reservations: true,
  })
  auth.sendPhoneCode.mockResolvedValue({
    verification_id: 'v1',
    expires_at: new Date(Date.now() + 180_000).toISOString(),
    resend_after_seconds: 60,
    debug_code: '123456',
  })
  auth.verifyPhoneCode.mockResolvedValue({ verification_id: 'v1', verified: true })
})

describe('LoginScreen', () => {
  it('목업 마크업 · 브랜드 환영 문구 · 소셜 버튼', async () => {
    const { container } = renderUi(<LoginScreen slug="clinic" brandName="BAZZAR" />)
    expect(container.querySelector('section.board-form.member-form')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'BAZZAR에 오신 것을 환영합니다.' })).toBeInTheDocument()
    expect(await screen.findByText('카카오로 로그인')).toHaveClass('member-form__sns-button--kakao')
    expect(screen.getByRole('link', { name: '비밀번호 찾기' })).toHaveAttribute('href', '/clinic/member/find-password')
  })

  it('첫 오류를 상태 줄에, 성공 시 next 로 이동', async () => {
    auth.login.mockResolvedValue(session)
    const { container } = renderUi(<LoginScreen slug="clinic" next="/clinic/about" brandName="BAZZAR" />)
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByText('필수 입력 항목입니다')).toHaveClass('board-form__status')
    expect(container.querySelector('#lg-email')).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'hong@example.com' } })
    fireEvent.change(container.querySelector('#lg-pw') as HTMLInputElement, { target: { value: 'abcd1234' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clinic/about'))
  })

  it('비밀번호 보기 버튼', () => {
    const { container } = renderUi(<LoginScreen slug="clinic" brandName="BAZZAR" />)
    const input = container.querySelector('#lg-pw') as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    expect(input.type).toBe('text')
    expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('잠금 → 남은 시간 · 버튼 비활성', async () => {
    auth.login.mockRejectedValue(
      new MemberApiError('30분 후에 다시 시도해주세요', 'ACCOUNT_LOCKED', 429, null, [{ retry_after_seconds: 1799 }]),
    )
    const { container } = renderUi(<LoginScreen slug="clinic" brandName="BAZZAR" />)
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'hong@example.com' } })
    fireEvent.change(container.querySelector('#lg-pw') as HTMLInputElement, { target: { value: 'wrong1234' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByLabelText('남은 잠금 시간')).toHaveTextContent('(29:59)')
    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled()
  })
})

describe('JoinScreen', () => {
  it('비밀번호 조건 표시 · 전체 동의 · 휴대폰 인증 후 가입', async () => {
    auth.checkEmail.mockResolvedValue({ email: 'hong@example.com', available: true })
    auth.register.mockResolvedValue(session)
    const { container } = renderUi(<JoinScreen slug="clinic" next="/clinic/notice" />)
    const set = (id: string, value: string) =>
      fireEvent.change(container.querySelector(`#${id}`) as HTMLInputElement, { target: { value } })
    set('jn-name', '홍길동')
    set('jn-email', 'hong@example.com')
    set('jn-pw', 'abcd1234')
    set('jn-pw2', 'abcd1234')
    expect(container.querySelectorAll('.member-form__rule--ok')).toHaveLength(3)

    set('jn-phone', '010-1234-5678')
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
    expect(await screen.findByText('개발용 인증번호: 123456')).toHaveClass('member-form__demo')
    expect(screen.getByLabelText('남은 시간')).toHaveClass('member-form__timer')
    set('jn-code', '123456')
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('휴대폰 인증이 완료되었어요.')).toHaveClass('member-form__result--ok')

    fireEvent.click(screen.getByLabelText('약관에 모두 동의합니다.'))
    expect(container.querySelector('#jn-ag-terms')).toBeChecked()
    expect(container.querySelector('#jn-ag-privacy')).toBeChecked()
    expect(container.querySelector('#jn-ag-mkt')).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clinic/notice'))
    expect(auth.register).toHaveBeenCalledWith(
      'clinic',
      expect.objectContaining({ phone_verification_id: 'v1', marketing_agree: true }),
    )
  })
})

describe('FindEmailScreen · ResetPasswordScreen', () => {
  it('없음 → "일치하는 계정이 없어요" + 다시 찾기', async () => {
    auth.findEmail.mockRejectedValue(new MemberApiError('없음', 'NOT_FOUND', 404))
    const { container } = renderUi(<FindEmailScreen slug="clinic" />)
    expect(screen.getByRole('link', { name: '이메일 찾기' })).toHaveAttribute('aria-current', 'page')
    fireEvent.change(container.querySelector('#fe-name') as HTMLInputElement, { target: { value: '홍길동' } })
    fireEvent.change(container.querySelector('#fe-phone') as HTMLInputElement, { target: { value: '01012345678' } })
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }))
    fireEvent.change(await screen.findByLabelText('인증번호 6자리'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    await screen.findByText('휴대폰 인증이 완료되었어요.')
    fireEvent.click(screen.getByRole('button', { name: '이메일 찾기' }))
    expect(await screen.findByRole('heading', { name: '일치하는 계정이 없어요' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 찾기' }))
    expect(container.querySelector('#fe-name')).not.toBeNull()
  })

  it('만료된 링크 화면', async () => {
    auth.checkResetToken.mockRejectedValue(new MemberApiError('만료', 'TOKEN_EXPIRED', 400))
    renderUi(<ResetPasswordScreen slug="clinic" token="old" />)
    expect(await screen.findByRole('heading', { name: '유효하지 않거나 만료된 링크입니다' })).toBeInTheDocument()
  })
})

describe('MypageScreen', () => {
  beforeEach(() => {
    useMemberStore.getState().setSession('clinic', session)
    api.getMe.mockResolvedValue({
      id: 'm1',
      name: '홍길동',
      email: 'hong@example.com',
      phone: '010-1234-5678',
      birth_date: null,
      social_provider: null,
      has_password: true,
      marketing_agree: false,
      sms_agree: true,
      email_agree: false,
      notify_reservation_confirmed: true,
      notify_reservation_cancelled: true,
      created_at: '2026-10-24T03:00:00Z',
      social_accounts: [],
    })
    api.listReservations.mockResolvedValue({
      items: [
        {
          id: 'r1',
          reservation_type: 'MEDICAL',
          status: 'CONFIRMED',
          reserved_at: new Date(Date.now() + 86_400_000 * 5).toISOString(),
          memo: null,
          detail: { department: '내과', visit_type: 'FIRST' },
          inquiry_id: null,
          created_at: '2026-10-20T00:00:00Z',
        },
      ],
    })
  })

  it('목업 마크업 — 인사 · 탭 · 예약 카드 배지', async () => {
    const { container } = renderUi(<MypageScreen slug="clinic" brandName="BAZZAR" />)
    expect(await screen.findByText('BAZZAR 회원 · 2026.10.24 가입')).toHaveClass('mypage__since')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['내 예약', '문의 내역', '알림 설정', '내 정보'])
    expect(await screen.findByText('예약 확정')).toHaveClass('mypage__badge', 'mypage__badge--confirmed')
    expect(screen.getByText('내과 · 초진')).toHaveClass('mypage__card-meta')
    expect(container.querySelector('#reservations')).toHaveAttribute('role', 'tabpanel')
    expect(screen.getByRole('link', { name: '새 예약하기' })).toHaveAttribute('href', '/clinic/reservation')
  })

  it('예약 기능이 없으면 내 예약 탭 숨김', async () => {
    auth.fetchAuthOptions.mockResolvedValue({ enabled: true, social_login: false, providers: [], reservations: false })
    renderUi(<MypageScreen slug="clinic" brandName="BAZZAR" />)
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(3))
    expect(screen.queryByRole('tab', { name: '내 예약' })).not.toBeInTheDocument()
  })
})

describe('MemberScreen', () => {
  it('비로그인 마이페이지 → 로그인으로', async () => {
    useMemberStore.setState({ slug: 'clinic', status: 'ready' })
    renderUi(<MemberScreen slug="clinic" brandName="BAZZAR" route={{ page: 'mypage', query: {} }} />)
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringContaining('/clinic/member/login?next=')),
    )
  })

  it('로그인 화면으로 분기 (next 전달)', async () => {
    renderUi(<MemberScreen slug="clinic" brandName="BAZZAR" route={{ page: 'login', query: { next: '/clinic/about' } }} />)
    expect(screen.getByRole('heading', { name: 'BAZZAR에 오신 것을 환영합니다.' })).toBeInTheDocument()
  })
})
