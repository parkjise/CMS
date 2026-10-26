/**
 * 방문자 회원 API (T-113, 기획서 16.10) — /api/public/{slug}/auth/* · /members/*
 *
 * - refresh 토큰은 API 가 HttpOnly 쿠키(Path=/api/public/{slug})로 관리 → withCredentials
 * - access token 은 memberStore 메모리에만 둔다 (localStorage 저장 금지)
 * - 에러는 공통 형식(5.1) `{ success: false, error: { code, message, field, details } }`
 */
import axios from 'axios'
import type { SocialProvider } from './memberSocial'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

export const memberHttp = axios.create({
  baseURL: `${BASE_URL}/public`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

export interface MemberSummary {
  id: string
  name: string
  email: string
}

export interface MemberSession {
  access_token: string
  member: MemberSummary
}

export type VerificationPurpose = 'REGISTER' | 'FIND_EMAIL' | 'RESET_PW' | 'MYPAGE'

export interface PhoneSendResult {
  verification_id: string
  expires_at: string
  resend_after_seconds: number
  debug_code: string | null
}

export interface FoundAccount {
  masked_email: string
  social_provider: SocialProvider | null
  created_at: string
}

export interface ForgotPasswordResult {
  masked_email: string
  expires_in_minutes: number
  resend_after_seconds: number
  debug_reset_url: string | null
}

export interface AuthOptions {
  social_login: boolean
  providers: SocialProvider[]
  /** 마이페이지 "내 예약" 탭 노출 (업종 · 기능 플래그) */
  reservations: boolean
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  password_confirm: string
  phone: string
  phone_verification_id: string
  birth_date?: string | null
  terms_agree: boolean
  privacy_agree: boolean
  marketing_agree: boolean
}

export interface SocialCompleteInput {
  signup_token: string
  email?: string | null
  name?: string | null
  phone: string
  phone_verification_id: string
  terms_agree: boolean
  privacy_agree: boolean
  marketing_agree: boolean
}

/** 서버 공통 에러 → 화면용 */
export class MemberApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly field: string | null = null,
    readonly details: Record<string, unknown>[] = [],
  ) {
    super(message)
    this.name = 'MemberApiError'
  }

  /** 429 잠금 · 재요청 대기 등 — details[0].retry_after_seconds */
  get retryAfterSeconds(): number | null {
    const value = this.details[0]?.retry_after_seconds
    return typeof value === 'number' ? value : null
  }
}

export const toMemberError = (error: unknown): MemberApiError => {
  if (error instanceof MemberApiError) return error
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      | { error?: { code?: string; message?: string; field?: string | null; details?: unknown } }
      | undefined
    const info = body?.error
    if (info?.message) {
      return new MemberApiError(
        info.message,
        info.code ?? 'ERROR',
        error.response?.status ?? 0,
        info.field ?? null,
        Array.isArray(info.details) ? (info.details as Record<string, unknown>[]) : [],
      )
    }
    if (!error.response) {
      return new MemberApiError('네트워크 연결을 확인해주세요', 'NETWORK_ERROR', 0)
    }
  }
  return new MemberApiError('잠시 후 다시 시도해주세요', 'INTERNAL_ERROR', 500)
}

const call = async <T>(request: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    const { data } = await request
    return data.data
  } catch (error) {
    throw toMemberError(error)
  }
}

const auth = (slug: string, path: string) => `/${encodeURIComponent(slug)}/auth${path}`
const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

export const fetchAuthOptions = (slug: string) =>
  call<AuthOptions>(memberHttp.get(auth(slug, '/options')))

export const checkEmail = (slug: string, email: string) =>
  call<{ email: string; available: boolean }>(
    memberHttp.get(auth(slug, '/check-email'), { params: { email } }),
  )

export const register = (slug: string, input: RegisterInput) =>
  call<MemberSession>(memberHttp.post(auth(slug, '/register'), input))

export const login = (
  slug: string,
  input: { email: string; password: string; remember_me: boolean },
) => call<MemberSession>(memberHttp.post(auth(slug, '/login'), input))

export const refreshSession = (slug: string) =>
  call<MemberSession>(memberHttp.post(auth(slug, '/refresh')))

export const logout = (slug: string, accessToken: string) =>
  call<{ logged_out: boolean }>(memberHttp.post(auth(slug, '/logout'), null, bearer(accessToken)))

export const sendPhoneCode = (slug: string, phone: string, purpose: VerificationPurpose) =>
  call<PhoneSendResult>(memberHttp.post(auth(slug, '/phone/send'), { phone, purpose }))

export const verifyPhoneCode = (slug: string, verificationId: string, code: string) =>
  call<{ verification_id: string; verified: boolean }>(
    memberHttp.post(auth(slug, '/phone/verify'), { verification_id: verificationId, code }),
  )

export const findEmail = (slug: string, name: string, verificationId: string) =>
  call<{ accounts: FoundAccount[] }>(
    memberHttp.post(auth(slug, '/find-email'), {
      name,
      phone_verification_id: verificationId,
    }),
  )

export const forgotPassword = (slug: string, email: string, verificationId: string) =>
  call<ForgotPasswordResult>(
    memberHttp.post(auth(slug, '/forgot-password'), {
      email,
      phone_verification_id: verificationId,
    }),
  )

export const checkResetToken = (slug: string, token: string) =>
  call<{ valid: boolean; masked_email: string }>(
    memberHttp.get(auth(slug, '/reset-password/check'), { params: { token } }),
  )

export const resetPassword = (
  slug: string,
  input: { token: string; password: string; password_confirm: string },
) => call<{ reset: boolean }>(memberHttp.post(auth(slug, '/reset-password'), input))

export const completeSocialSignup = (slug: string, input: SocialCompleteInput) =>
  call<MemberSession & { return_to: string }>(
    memberHttp.post(auth(slug, '/social/complete'), input),
  )

/** 로그인 후 돌아갈 경로 — 같은 사이트 상대 경로만 (오픈 리다이렉트 방지) */
export const safeNext = (slug: string, next: string | null | undefined): string => {
  const fallback = `/${slug}/member/mypage`
  if (!next || !next.startsWith(`/${slug}`) || next.startsWith('//')) return fallback
  if (next.includes('\\') || next.includes('://')) return fallback
  return next
}
