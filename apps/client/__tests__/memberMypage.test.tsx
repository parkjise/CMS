import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as authApi from '@/lib/memberAuth'
import { MemberApiError, memberHttp } from '@/lib/memberAuth'
import * as account from '@/lib/memberAccount'
import type { MemberProfile, MemberReservation } from '@/lib/memberAccount'
import { addDays, formatDate, formatTime, formatWon } from '@/lib/memberFormat'
import { useMemberStore } from '@/lib/memberStore'
import MypageView from '@/components/member/mypage/MypageView'
import ReservationCard from '@/components/member/mypage/ReservationCard'
import WithdrawFlow from '@/components/member/WithdrawFlow'
import RequireMember from '@/components/member/RequireMember'

/** 마이페이지 · 탈퇴 (T-114, 기획서 16.7 · 16.8) */

const replace = vi.fn()
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/clinic/member/mypage',
  useSearchParams: () => search,
}))

vi.mock('@/lib/memberAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/memberAuth')>()
  return { ...actual, fetchAuthOptions: vi.fn(), refreshSession: vi.fn() }
})
vi.mock('@/lib/memberAccount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/memberAccount')>()
  return {
    ...actual,
    getMe: vi.fn(),
    updateMe: vi.fn(),
    changePassword: vi.fn(),
    getNotifications: vi.fn(),
    updateNotifications: vi.fn(),
    listReservations: vi.fn(),
    cancelReservation: vi.fn(),
    listInquiries: vi.fn(),
    getInquiry: vi.fn(),
    listSocialAccounts: vi.fn(),
    unlinkSocial: vi.fn(),
    linkSocialUrl: vi.fn(),
    withdraw: vi.fn(),
  }
})
const auth = vi.mocked(authApi)
const api = vi.mocked(account)

const FUTURE = new Date(Date.now() + 5 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 20 * 86_400_000).toISOString()

const profile: MemberProfile = {
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
}
const reservation = (overrides: Partial<MemberReservation>): MemberReservation => ({
  id: 'r1',
  reservation_type: 'MEDICAL',
  status: 'CONFIRMED',
  reserved_at: FUTURE,
  memo: null,
  detail: { department: '내과', visit_type: 'FIRST' },
  inquiry_id: null,
  created_at: PAST,
  ...overrides,
})

const signIn = () =>
  useMemberStore.setState({
    slug: 'clinic',
    member: { id: 'm1', name: '홍길동', email: 'hong@example.com' },
    accessToken: 'access-1',
    status: 'ready',
  })

const renderUi = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  )

const options = (reservations: boolean, social = false) =>
  auth.fetchAuthOptions.mockResolvedValue({
    social_login: social,
    providers: social ? ['KAKAO', 'NAVER'] : [],
    reservations,
  })

beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams()
  window.localStorage.clear()
  signIn()
  api.getMe.mockResolvedValue(profile)
  api.listReservations.mockResolvedValue({ items: [] })
  api.listInquiries.mockResolvedValue({ items: [] })
  api.getNotifications.mockResolvedValue({
    notify_reservation_confirmed: true,
    notify_reservation_cancelled: true,
    marketing_agree: false,
    sms_agree: true,
    email_agree: false,
  })
  api.listSocialAccounts.mockResolvedValue({ accounts: [], has_password: true })
})

describe('withMemberAuth', () => {
  it('401 이면 refresh 후 다시 시도, 실패하면 세션 정리', async () => {
    const { withMemberAuth } = await vi.importActual<typeof import('@/lib/memberAccount')>(
      '@/lib/memberAccount',
    )
    const run = vi
      .fn()
      .mockRejectedValueOnce(new MemberApiError('만료', 'UNAUTHORIZED', 401))
      .mockResolvedValueOnce('ok')
    auth.refreshSession.mockResolvedValueOnce({
      access_token: 'access-2',
      member: { id: 'm1', name: '홍길동', email: 'hong@example.com' },
    })
    await expect(withMemberAuth('clinic', run)).resolves.toBe('ok')
    expect(run).toHaveBeenLastCalledWith('access-2')

    auth.refreshSession.mockRejectedValueOnce(new MemberApiError('x', 'UNAUTHORIZED', 401))
    const failing = vi.fn().mockRejectedValue(new MemberApiError('만료', 'UNAUTHORIZED', 401))
    await expect(withMemberAuth('clinic', failing)).rejects.toMatchObject({ status: 401 })
    expect(useMemberStore.getState().member).toBeNull()
  })

  it('실제 요청에 Bearer 토큰을 붙인다', async () => {
    const { getMe } = await vi.importActual<typeof import('@/lib/memberAccount')>(
      '@/lib/memberAccount',
    )
    const request = vi.spyOn(memberHttp, 'request').mockResolvedValue({ data: { data: profile } })
    await getMe('clinic')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/clinic/members/me',
        headers: { Authorization: 'Bearer access-1' },
      }),
    )
  })
})

describe('RequireMember', () => {
  it('비로그인 → 로그인 화면 (돌아올 주소)', async () => {
    useMemberStore.setState({ slug: 'clinic', member: null, accessToken: null, status: 'ready' })
    search = new URLSearchParams('tab=profile')
    render(
      <RequireMember slug="clinic">
        <p>비밀</p>
      </RequireMember>,
    )
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/clinic/member/login?next=%2Fclinic%2Fmember%2Fmypage%3Ftab%3Dprofile',
      ),
    )
    expect(screen.queryByText('비밀')).not.toBeInTheDocument()
  })
})

describe('MypageView — 업종별 탭', () => {
  it('예약 기능이 있는 업종(병원 · 펜션): 탭 4개, 첫 탭은 내 예약', async () => {
    options(true)
    renderUi(<MypageView slug="clinic" />)
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['내 예약', '문의 내역', '알림 설정', '내 정보'])
    expect(screen.getByRole('tab', { name: '내 예약' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('안녕하세요, 홍길동 님 👋')).toBeInTheDocument()
  })

  it('예약이 없는 업종(스타트업 · 일반): 내 예약 탭 숨김 · 예약 알림 항목 숨김', async () => {
    options(false)
    search = new URLSearchParams('tab=notifications')
    renderUi(<MypageView slug="clinic" />)
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['문의 내역', '알림 설정', '내 정보'])
    expect(await screen.findByRole('switch', { name: '문자 수신' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '예약 확정 알림' })).not.toBeInTheDocument()
  })

  it('없는 탭 요청 · 숨긴 탭 요청은 첫 탭', async () => {
    options(false)
    search = new URLSearchParams('tab=reservations')
    renderUi(<MypageView slug="clinic" />)
    expect(await screen.findByRole('tab', { name: '문의 내역' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('탭 전환은 주소의 tab 으로', async () => {
    options(true)
    renderUi(<MypageView slug="clinic" />)
    fireEvent.click(await screen.findByRole('tab', { name: '내 정보' }))
    expect(replace).toHaveBeenCalledWith('/clinic/member/mypage?tab=profile')
  })

  it('소셜 연결 후 돌아오면 안내', async () => {
    options(true, true)
    search = new URLSearchParams('tab=profile&linked=kakao')
    renderUi(<MypageView slug="clinic" />)
    expect(await screen.findByText('카카오 계정이 연결되었습니다.')).toBeInTheDocument()
  })
})

describe('ReservationCard — 업종별', () => {
  const renderCard = (r: MemberReservation, onCancel = vi.fn()) => {
    render(
      <ul>
        <ReservationCard reservation={r} onCancel={onCancel} cancelling={false} />
      </ul>,
    )
    return onCancel
  }

  it('병원: 일시 · 진료과 · 초진', () => {
    renderCard(reservation({}))
    expect(screen.getByText(`${formatDate(FUTURE)} ${formatTime(FUTURE)}`)).toBeInTheDocument()
    expect(screen.getByText('내과 · 초진')).toBeInTheDocument()
    expect(screen.getByText('예약 확정')).toBeInTheDocument()
  })

  it('펜션: 기간 · 박 · 객실 · 인원 · 금액', () => {
    renderCard(
      reservation({
        reservation_type: 'LODGING',
        status: 'PENDING',
        detail: { room: '오션뷰 A동', guests: 2, nights: 1, amount: 150000 },
      }),
    )
    const checkout = formatDate(addDays(FUTURE, 1)).slice(5)
    expect(screen.getByText(`${formatDate(FUTURE)} ~ ${checkout}`)).toBeInTheDocument()
    expect(screen.getByText('1박 · 오션뷰 A동 · 성인 2명')).toBeInTheDocument()
    expect(screen.getByText(`결제 금액: ${formatWon(150000)}`)).toBeInTheDocument()
    expect(screen.getByText('대기중')).toBeInTheDocument()
  })

  it('일반: 제목 · 일시', () => {
    renderCard(reservation({ reservation_type: 'GENERAL', detail: { subject: '첫 상담' } }))
    expect(screen.getByText('첫 상담')).toBeInTheDocument()
  })

  it('취소는 확인 후 · 지난 · 완료 예약은 버튼 없음', () => {
    const onCancel = renderCard(reservation({}))
    fireEvent.click(screen.getByRole('button', { name: '예약 취소' }))
    fireEvent.click(screen.getByRole('button', { name: '취소하기' }))
    expect(onCancel).toHaveBeenCalledWith('r1')
  })

  it.each([
    ['완료', { status: 'COMPLETED' as const }],
    ['취소됨', { status: 'CANCELLED' as const }],
    ['지난 예약', { reserved_at: PAST }],
  ])('%s → 취소 버튼 없음', (_, overrides) => {
    renderCard(reservation(overrides))
    expect(screen.queryByRole('button', { name: '예약 취소' })).not.toBeInTheDocument()
  })
})

describe('탭 동작', () => {
  it('예약 취소 → 목록 다시 조회', async () => {
    options(true)
    api.listReservations
      .mockResolvedValueOnce({ items: [reservation({})] })
      .mockResolvedValue({ items: [reservation({ status: 'CANCELLED' })] })
    api.cancelReservation.mockResolvedValue(reservation({ status: 'CANCELLED' }))
    renderUi(<MypageView slug="clinic" />)
    fireEvent.click(await screen.findByRole('button', { name: '예약 취소' }))
    fireEvent.click(screen.getByRole('button', { name: '취소하기' }))
    expect(await screen.findByText('취소')).toBeInTheDocument()
    expect(api.cancelReservation).toHaveBeenCalledWith('clinic', 'r1')
    expect(api.listReservations).toHaveBeenLastCalledWith('clinic', { status: null, months: 3 })
  })

  it('예약 필터 — 상태 · 기간', async () => {
    options(true)
    renderUi(<MypageView slug="clinic" />)
    fireEvent.change(await screen.findByLabelText('예약 상태'), { target: { value: 'COMPLETED' } })
    fireEvent.change(screen.getByLabelText('조회 기간'), { target: { value: '0' } })
    await waitFor(() =>
      expect(api.listReservations).toHaveBeenLastCalledWith('clinic', {
        status: 'COMPLETED',
        months: null,
      }),
    )
  })

  it('문의 내역 — 배지 · 상세(답변)', async () => {
    options(false)
    api.listInquiries.mockResolvedValue({
      items: [
        { id: 'q1', inquiry_type: 'CONSULT', subject: '주차 문의', is_board: true, answered: true, created_at: PAST },
        { id: 'q2', inquiry_type: 'GENERAL', subject: null, is_board: false, answered: false, created_at: PAST },
      ],
    })
    api.getInquiry.mockResolvedValue({
      id: 'q1', inquiry_type: 'CONSULT', subject: '주차 문의', is_board: true, answered: true,
      created_at: PAST, message: '주차 되나요?', answer: '10대 가능합니다.', answered_at: PAST,
      reserved_date: null, reserved_time: null,
    })
    renderUi(<MypageView slug="clinic" />)
    expect(await screen.findByText('답변 완료')).toBeInTheDocument()
    expect(screen.getByText('답변 대기')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '상세보기' })[0])
    expect(await screen.findByText('10대 가능합니다.')).toBeInTheDocument()
  })

  it('알림 토글 — 즉시 반영, 실패하면 되돌림', async () => {
    options(true)
    search = new URLSearchParams('tab=notifications')
    let rejectSave: (e: unknown) => void = () => undefined
    api.updateNotifications.mockImplementation(
      () => new Promise((_, reject) => (rejectSave = reject)),
    )
    renderUi(<MypageView slug="clinic" />)
    const toggle = await screen.findByRole('switch', { name: '마케팅/이벤트 알림' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(api.updateNotifications).toHaveBeenCalledWith('clinic', { marketing_agree: true })
    await act(async () => rejectSave(new MemberApiError('오류', 'INTERNAL_ERROR', 500)))
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했습니다')
  })
})

describe('내 정보', () => {
  const openProfile = async (social = false) => {
    options(true, social)
    search = new URLSearchParams('tab=profile')
    renderUi(<MypageView slug="clinic" />)
    return screen.findByText('hong@example.com')
  }

  it('이름 수정 · 검증', async () => {
    api.updateMe.mockResolvedValue({ ...profile, name: '홍길순' })
    await openProfile()
    const nameRow = screen.getByText('홍길동', { selector: 'span' }).parentElement as HTMLElement
    fireEvent.click(within(nameRow).getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByLabelText('새 이름'), { target: { value: '홍' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('이름을 올바르게 입력해주세요')
    fireEvent.change(screen.getByLabelText('새 이름'), { target: { value: '홍길순' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('저장되었습니다.')).toBeInTheDocument()
    expect(api.updateMe).toHaveBeenCalledWith('clinic', { name: '홍길순' })
  })

  it('비밀번호 변경 → 새 토큰 적용', async () => {
    api.changePassword.mockResolvedValue({ access_token: 'access-new' })
    await openProfile()
    fireEvent.click(screen.getByRole('button', { name: '변경' }))
    fireEvent.change(screen.getByLabelText(/^현재 비밀번호/), { target: { value: 'abcd1234' } })
    fireEvent.change(screen.getByLabelText(/^새 비밀번호\*?$/), { target: { value: 'newpass99' } })
    fireEvent.change(screen.getByLabelText(/^새 비밀번호 확인/), { target: { value: 'newpass99' } })
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))
    expect(await screen.findByText(/비밀번호가 변경되었습니다/)).toBeInTheDocument()
    expect(useMemberStore.getState().accessToken).toBe('access-new')
    expect(api.changePassword).toHaveBeenCalledWith('clinic', {
      current_password: 'abcd1234',
      password: 'newpass99',
      password_confirm: 'newpass99',
    })
  })

  it('소셜 가입자 첫 비밀번호 — 휴대폰 인증 안내', async () => {
    api.getMe.mockResolvedValue({ ...profile, has_password: false, social_provider: 'KAKAO' })
    await openProfile()
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.getByText(/본인 확인 후 비밀번호를 설정할 수 있어요/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^현재 비밀번호/)).not.toBeInTheDocument()
  })

  it('소셜 연결 · 해제 · 마지막 수단 안내', async () => {
    api.listSocialAccounts.mockResolvedValue({
      accounts: [{ provider: 'KAKAO', email: null, linked_at: PAST }],
      has_password: false,
    })
    api.unlinkSocial.mockRejectedValue(
      new MemberApiError(
        '다른 로그인 방법이 없어 연결을 해제할 수 없습니다. 비밀번호를 먼저 설정해주세요',
        'LAST_LOGIN_METHOD',
        409,
      ),
    )
    api.linkSocialUrl.mockResolvedValue({ authorize_url: 'https://nid.naver.com/x' })
    await openProfile(true)
    expect(await screen.findByText('연결됨')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '카카오 연결 해제' }))
    expect(await screen.findByText(/비밀번호를 먼저 설정해주세요/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '네이버 연결하기' }))
    await waitFor(() =>
      expect(api.linkSocialUrl).toHaveBeenCalledWith('clinic', 'NAVER', '/clinic/member/mypage?tab=profile'),
    )
  })
})

describe('WithdrawFlow', () => {
  it('진행 중 예약 → 차단 안내 + 내 예약 링크', async () => {
    api.withdraw.mockRejectedValue(
      new MemberApiError(
        '진행 중인 예약이 있어 탈퇴할 수 없습니다. 예약을 먼저 취소해주세요',
        'ACTIVE_RESERVATION_EXISTS',
        409,
      ),
    )
    renderUi(<WithdrawFlow slug="clinic" />)
    fireEvent.change(await screen.findByLabelText(/^비밀번호 확인/), { target: { value: 'abcd1234' } })
    fireEvent.click(screen.getByRole('button', { name: '탈퇴하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('진행 중인 예약이 있어')
    expect(screen.getByRole('link', { name: '내 예약 확인하기' })).toHaveAttribute(
      'href',
      '/clinic/member/mypage?tab=reservations',
    )
    expect(useMemberStore.getState().member).not.toBeNull()
  })

  it('탈퇴 성공 → 자동 로그아웃 + 완료 화면', async () => {
    api.withdraw.mockResolvedValue({ withdrawn: true })
    window.localStorage.setItem('member_session:clinic', '1')
    renderUi(<WithdrawFlow slug="clinic" />)
    fireEvent.change(await screen.findByLabelText('탈퇴 사유 (선택)'), { target: { value: 'OTHER' } })
    fireEvent.change(screen.getByLabelText('기타 사유'), { target: { value: '이사' } })
    fireEvent.change(screen.getByLabelText(/^비밀번호 확인/), { target: { value: 'abcd1234' } })
    fireEvent.click(screen.getByRole('button', { name: '탈퇴하기' }))
    expect(await screen.findByText('회원 탈퇴가 완료되었습니다.')).toBeInTheDocument()
    // 세션이 끝나도 로그인 화면으로 보내지 않고 완료 화면을 보여준다 (E2E 에서 발견한 문제)
    expect(replace).not.toHaveBeenCalled()
    expect(api.withdraw).toHaveBeenCalledWith('clinic', {
      password: 'abcd1234',
      reason: 'OTHER',
      reason_detail: '이사',
    })
    expect(useMemberStore.getState().member).toBeNull()
    expect(window.localStorage.getItem('member_session:clinic')).toBeNull()
  })

  it('소셜 가입자는 비밀번호 입력 없음', async () => {
    api.getMe.mockResolvedValue({ ...profile, has_password: false })
    api.withdraw.mockResolvedValue({ withdrawn: true })
    renderUi(<WithdrawFlow slug="clinic" />)
    fireEvent.click(await screen.findByRole('button', { name: '탈퇴하기' }))
    await waitFor(() => expect(api.withdraw).toHaveBeenCalledWith('clinic', { reason: null }))
    expect(screen.queryByLabelText(/^비밀번호 확인/)).not.toBeInTheDocument()
  })
})
