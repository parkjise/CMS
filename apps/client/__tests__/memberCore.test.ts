import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import {
  MemberApiError,
  memberHttp,
  safeNext,
  toMemberError,
} from '@/lib/memberAuth'
import { joinSchema, passwordChecks, MESSAGES } from '@/lib/memberSchemas'
import { memberAuthHeader, useMemberStore } from '@/lib/memberStore'

/** 방문자 회원 — 검증 규칙 · 에러 변환 · 스토어 (T-113) */

const session = {
  access_token: 'access-1',
  member: { id: 'm1', name: '홍길동', email: 'hong@example.com' },
}

const axiosError = (status: number, body: unknown) => {
  const error = new AxiosError('fail')
  error.response = { status, data: body } as AxiosResponse
  return error
}

describe('memberSchemas', () => {
  const valid = {
    name: '홍길동',
    email: 'hong@example.com',
    password: 'abcd1234',
    password_confirm: 'abcd1234',
    phone: '010-1234-5678',
    phone_verification_id: 'v1',
    birth_date: '',
    terms_agree: true,
    privacy_agree: true,
    marketing_agree: false,
  }
  const messagesFor = (overrides: Partial<typeof valid>) => {
    const result = joinSchema.safeParse({ ...valid, ...overrides })
    return result.success ? [] : result.error.issues.map((i) => i.message)
  }

  it('정상 입력은 통과', () => {
    expect(messagesFor({})).toEqual([])
  })

  it('기획서 16.3 검증 문구', () => {
    expect(messagesFor({ name: '홍' })).toEqual([MESSAGES.name])
    expect(messagesFor({ name: '홍길동!' })).toEqual([MESSAGES.name])
    expect(messagesFor({ password: 'abcdefgh', password_confirm: 'abcdefgh' })).toEqual([
      MESSAGES.password,
    ])
    expect(messagesFor({ password_confirm: 'abcd9999' })).toEqual([MESSAGES.passwordConfirm])
    expect(messagesFor({ phone: '02-123-4567' })).toEqual([MESSAGES.phone])
    expect(messagesFor({ phone_verification_id: '' })).toEqual([MESSAGES.phoneVerified])
    expect(messagesFor({ privacy_agree: false })).toEqual([MESSAGES.terms])
  })

  it('비밀번호 강도 항목', () => {
    expect(passwordChecks('abc')).toEqual({ length: false, letter: true, digit: false })
    expect(passwordChecks('abcd1234')).toEqual({ length: true, letter: true, digit: true })
  })
})

describe('safeNext', () => {
  it('같은 사이트 상대 경로만 허용', () => {
    expect(safeNext('clinic', '/clinic/about')).toBe('/clinic/about')
    expect(safeNext('clinic', null)).toBe('/clinic/member/mypage')
    expect(safeNext('clinic', 'https://evil.com')).toBe('/clinic/member/mypage')
    expect(safeNext('clinic', '//evil.com')).toBe('/clinic/member/mypage')
    expect(safeNext('clinic', '/other/about')).toBe('/clinic/member/mypage')
  })
})

describe('toMemberError', () => {
  it('공통 에러 형식 · 잠금 남은 시간', () => {
    const error = toMemberError(
      axiosError(429, {
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: '30분 후에 다시 시도해주세요',
          field: null,
          details: [{ retry_after_seconds: 1799 }],
        },
      }),
    )
    expect(error).toBeInstanceOf(MemberApiError)
    expect([error.code, error.status, error.retryAfterSeconds]).toEqual(['ACCOUNT_LOCKED', 429, 1799])
  })

  it('네트워크 오류 · 알 수 없는 오류', () => {
    expect(toMemberError(new AxiosError('down')).code).toBe('NETWORK_ERROR')
    expect(toMemberError(new Error('x')).message).toBe('잠시 후 다시 시도해주세요')
  })
})

describe('memberStore', () => {
  const post = vi.spyOn(memberHttp, 'post')

  beforeEach(() => {
    window.localStorage.clear()
    post.mockReset()
    useMemberStore.setState({ slug: null, member: null, accessToken: null, status: 'idle' })
  })
  afterEach(() => vi.clearAllMocks())

  it('로그인한 적이 없으면 refresh 를 부르지 않는다', async () => {
    await useMemberStore.getState().initialize('clinic')
    expect(post).not.toHaveBeenCalled()
    expect(useMemberStore.getState()).toMatchObject({ slug: 'clinic', member: null, status: 'ready' })
  })

  it('표시가 있으면 refresh 쿠키로 복원 — 토큰은 메모리에만', async () => {
    window.localStorage.setItem('member_session:clinic', '1')
    post.mockResolvedValue({ data: { data: session } })
    await useMemberStore.getState().initialize('clinic')
    expect(post).toHaveBeenCalledWith('/clinic/auth/refresh')
    expect(useMemberStore.getState().member?.name).toBe('홍길동')
    expect(JSON.stringify(window.localStorage)).not.toContain('access-1')
  })

  it('refresh 실패 → 표시 삭제 · 비로그인', async () => {
    window.localStorage.setItem('member_session:clinic', '1')
    post.mockRejectedValue(axiosError(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'x' } }))
    await useMemberStore.getState().initialize('clinic')
    expect(window.localStorage.getItem('member_session:clinic')).toBeNull()
    expect(useMemberStore.getState().member).toBeNull()
  })

  it('setSession · logout', async () => {
    useMemberStore.getState().setSession('clinic', session)
    expect(window.localStorage.getItem('member_session:clinic')).toBe('1')
    post.mockResolvedValue({ data: { data: { logged_out: true } } })
    await useMemberStore.getState().logout()
    expect(post).toHaveBeenCalledWith('/clinic/auth/logout', null, {
      headers: { Authorization: 'Bearer access-1' },
    })
    expect(useMemberStore.getState().member).toBeNull()
    expect(window.localStorage.getItem('member_session:clinic')).toBeNull()
  })
})

describe('memberAuthHeader (T-115 — 공개 접수에 회원 연결)', () => {
  const jwt = (expSeconds: number) =>
    `h.${btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, '')}.s`
  const post = vi.spyOn(memberHttp, 'post')

  beforeEach(() => {
    post.mockReset()
    useMemberStore.setState({ slug: null, member: null, accessToken: null, status: 'ready' })
  })

  it('비회원 · 다른 테넌트 세션이면 빈 헤더', async () => {
    expect(await memberAuthHeader('clinic')).toEqual({})
    useMemberStore.getState().setSession('other', { ...session, access_token: jwt(9_999_999_999) })
    expect(await memberAuthHeader('clinic')).toEqual({})
  })

  it('유효한 토큰은 그대로', async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 600)
    useMemberStore.getState().setSession('clinic', { ...session, access_token: token })
    expect(await memberAuthHeader('clinic')).toEqual({ Authorization: `Bearer ${token}` })
    expect(post).not.toHaveBeenCalled()
  })

  it('만료 직전이면 refresh 후 새 토큰', async () => {
    useMemberStore.getState().setSession('clinic', { ...session, access_token: jwt(1) })
    post.mockResolvedValue({ data: { data: { ...session, access_token: 'fresh' } } })
    expect(await memberAuthHeader('clinic')).toEqual({ Authorization: 'Bearer fresh' })
    expect(post).toHaveBeenCalledWith('/clinic/auth/refresh')
  })

  it('refresh 실패면 비회원 접수 (빈 헤더)', async () => {
    useMemberStore.getState().setSession('clinic', { ...session, access_token: jwt(1) })
    post.mockRejectedValue(new Error('401'))
    expect(await memberAuthHeader('clinic')).toEqual({})
  })
})
