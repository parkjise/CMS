/**
 * 방문자 마이페이지 · 탈퇴 API (T-114, 기획서 16.7 · 16.8 — T-111 API)
 *
 * 모든 호출은 memberStore 의 access token 을 붙인다. 401 이면 refresh 쿠키로 한 번 갱신해
 * 다시 시도하고, 그래도 실패하면 세션을 비운다 (화면은 로그인으로 이동).
 */
import {
  MemberApiError,
  memberHttp,
  refreshSession,
  toMemberError,
} from './memberAuth'
import { useMemberStore } from './memberStore'
import type { SocialProvider } from './memberSocial'

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
export type ReservationType = 'MEDICAL' | 'LODGING' | 'GENERAL'

export interface MemberProfile {
  id: string
  name: string
  email: string
  phone: string | null
  birth_date: string | null
  social_provider: SocialProvider | null
  has_password: boolean
  marketing_agree: boolean
  sms_agree: boolean
  email_agree: boolean
  notify_reservation_confirmed: boolean
  notify_reservation_cancelled: boolean
  created_at: string
  social_accounts: SocialProvider[]
}

export interface NotificationSettings {
  notify_reservation_confirmed: boolean
  notify_reservation_cancelled: boolean
  marketing_agree: boolean
  sms_agree: boolean
  email_agree: boolean
}

export interface MemberReservation {
  id: string
  reservation_type: ReservationType
  status: ReservationStatus
  reserved_at: string | null
  memo: string | null
  detail: Record<string, unknown>
  inquiry_id: string | null
  created_at: string
}

export interface MemberInquiry {
  id: string
  inquiry_type: string
  subject: string | null
  is_board: boolean
  answered: boolean
  created_at: string
}

export interface MemberInquiryDetail extends MemberInquiry {
  message: string
  answer: string | null
  answered_at: string | null
  reserved_date: string | null
  reserved_time: string | null
}

export interface SocialAccounts {
  accounts: { provider: SocialProvider; email: string | null; linked_at: string }[]
  has_password: boolean
}

export type WithdrawalReason = 'INCONVENIENT' | 'PRIVACY' | 'NOT_USING' | 'OTHER'

type Method = 'get' | 'post' | 'patch' | 'delete'

const send = async <T>(
  method: Method,
  url: string,
  token: string,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<T> => {
  const { data } = await memberHttp.request<{ data: T }>({
    method,
    url,
    data: body,
    params,
    headers: { Authorization: `Bearer ${token}` },
  })
  return data.data
}

/** 인증 호출 — 401 이면 refresh 후 한 번 더 */
export const withMemberAuth = async <T>(
  slug: string,
  run: (token: string) => Promise<T>,
): Promise<T> => {
  const token = useMemberStore.getState().accessToken
  if (!token) throw new MemberApiError('로그인이 필요합니다', 'UNAUTHORIZED', 401)
  try {
    return await run(token)
  } catch (error) {
    const err = toMemberError(error)
    if (err.status !== 401) throw err
  }
  try {
    const session = await refreshSession(slug)
    useMemberStore.getState().setSession(slug, session)
    return await run(session.access_token)
  } catch (error) {
    useMemberStore.getState().clear()
    throw toMemberError(error)
  }
}

const base = (slug: string) => `/${encodeURIComponent(slug)}/members`
const call = <T>(slug: string, method: Method, path: string, body?: unknown, params?: Record<string, unknown>) =>
  withMemberAuth(slug, (token) => send<T>(method, `${base(slug)}${path}`, token, body, params))

export const getMe = (slug: string) => call<MemberProfile>(slug, 'get', '/me')

export const updateMe = (
  slug: string,
  patch: { name?: string; birth_date?: string | null; phone?: string; phone_verification_id?: string },
) => call<MemberProfile>(slug, 'patch', '/me', patch)

export const changePassword = (
  slug: string,
  body: {
    current_password?: string
    phone_verification_id?: string
    password: string
    password_confirm: string
  },
) => call<{ access_token: string }>(slug, 'patch', '/me/password', body)

export const getNotifications = (slug: string) =>
  call<NotificationSettings>(slug, 'get', '/me/notification')

export const updateNotifications = (slug: string, patch: Partial<NotificationSettings>) =>
  call<NotificationSettings>(slug, 'patch', '/me/notification', patch)

export const listReservations = (
  slug: string,
  filters: { status?: ReservationStatus | null; months?: number | null },
) =>
  call<{ items: MemberReservation[] }>(slug, 'get', '/reservations', undefined, {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.months ? { months: filters.months } : {}),
  })

export const cancelReservation = (slug: string, id: string) =>
  call<MemberReservation>(slug, 'post', `/reservations/${id}/cancel`)

export const listInquiries = (slug: string) =>
  call<{ items: MemberInquiry[] }>(slug, 'get', '/inquiries')

export const getInquiry = (slug: string, id: string) =>
  call<MemberInquiryDetail>(slug, 'get', `/inquiries/${id}`)

export const listSocialAccounts = (slug: string) =>
  call<SocialAccounts>(slug, 'get', '/me/social')

export const linkSocialUrl = (slug: string, provider: SocialProvider, returnTo: string) =>
  call<{ authorize_url: string }>(
    slug,
    'post',
    `/me/social/${provider.toLowerCase()}/authorize`,
    undefined,
    { return_to: returnTo },
  )

export const unlinkSocial = (slug: string, provider: SocialProvider) =>
  call<SocialAccounts>(slug, 'delete', `/me/social/${provider.toLowerCase()}`)

export const withdraw = (
  slug: string,
  body: { password?: string; reason?: WithdrawalReason | null; reason_detail?: string },
) => call<{ withdrawn: boolean }>(slug, 'delete', '/me', body)
