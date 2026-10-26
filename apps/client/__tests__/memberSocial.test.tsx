import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SocialCallback from '@/components/member/SocialCallback'
import {
  PENDING_SIGNUP_KEY,
  completeSocialCallback,
  loadPendingSignup,
  slugFromState,
} from '@/lib/memberSocial'

/** 소셜 로그인 공용 콜백 (T-110, 기획서 16.4) */
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => search }))

vi.mock('@/lib/memberSocial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/memberSocial')>()
  return { ...actual, completeSocialCallback: vi.fn() }
})
const completeMock = vi.mocked(completeSocialCallback)

const sessionStore: Record<string, string> = {}
beforeEach(() => {
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k])
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => sessionStore[k] ?? null,
    setItem: (k: string, v: string) => {
      sessionStore[k] = v
    },
    removeItem: (k: string) => delete sessionStore[k],
  })
  completeMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const baseResult = {
  provider: 'KAKAO' as const,
  return_to: '/clinic/about',
  access_token: null,
  member: null,
  signup_token: null,
  email_required: false,
  suggested_name: null,
}

const renderWith = (query: string) => {
  search = new URLSearchParams(query)
  const navigate = vi.fn()
  render(<SocialCallback navigate={navigate} />)
  return navigate
}

describe('slugFromState', () => {
  it('state 앞의 slug 를 꺼낸다', () => {
    expect(slugFromState('clinic-a.AbC_d-123')).toBe('clinic-a')
    expect(slugFromState('nodot')).toBeNull()
    expect(slugFromState('../evil.x')).toBeNull()
  })
})

describe('SocialCallback', () => {
  it('로그인 완료 → 원래 페이지로 이동', async () => {
    completeMock.mockResolvedValue({
      ...baseResult,
      status: 'LOGGED_IN',
      access_token: 'a',
      member: { id: 'm', name: '홍길동', email: 'h@x.com' },
    })
    const navigate = renderWith('code=c1&state=clinic.nonce')
    expect(screen.getByText('로그인 중입니다…')).toBeInTheDocument()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clinic/about'))
    expect(completeMock).toHaveBeenCalledWith('clinic', 'c1', 'clinic.nonce')
  })

  it('신규 회원 → 가입 정보를 세션에 저장하고 추가 정보 화면으로', async () => {
    completeMock.mockResolvedValue({
      ...baseResult,
      status: 'SIGNUP_REQUIRED',
      signup_token: 'signup-token',
      email_required: true,
      suggested_name: '카카오친구',
    })
    const navigate = renderWith('code=c1&state=clinic.nonce')
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clinic/member/join-social'))
    expect(loadPendingSignup()).toEqual({
      slug: 'clinic',
      provider: 'KAKAO',
      signupToken: 'signup-token',
      emailRequired: true,
      suggestedName: '카카오친구',
      returnTo: '/clinic/about',
    })
    expect(sessionStore[PENDING_SIGNUP_KEY]).toBeDefined()
  })

  it('계정 연결 → 마이페이지에 linked 표시', async () => {
    completeMock.mockResolvedValue({
      ...baseResult,
      status: 'LINKED',
      provider: 'NAVER',
      return_to: '/clinic/member/mypage',
    })
    const navigate = renderWith('code=c1&state=clinic.nonce')
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/clinic/member/mypage?linked=naver'),
    )
  })

  it('API 오류 → 서버 메시지 + 로그인으로 돌아가기', async () => {
    const { AxiosError } = await import('axios')
    const error = new AxiosError('409')
    error.response = {
      data: { success: false, error: { message: '이미 이메일로 가입된 계정입니다' } },
    } as never
    completeMock.mockRejectedValue(error)
    const navigate = renderWith('code=c1&state=clinic.nonce')
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 이메일로 가입된 계정입니다')
    expect(screen.getByRole('link', { name: '로그인으로 돌아가기' })).toHaveAttribute(
      'href',
      '/clinic/member/login',
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('동의 취소(error 파라미터) → API 를 부르지 않는다', async () => {
    renderWith('error=access_denied&state=clinic.nonce')
    expect(await screen.findByRole('alert')).toHaveTextContent('취소')
    expect(completeMock).not.toHaveBeenCalled()
  })
})
