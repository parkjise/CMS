/**
 * 방문자 소셜 로그인 (T-110, 기획서 16.4) — /api/public/{slug}/auth/social*
 *
 * 카카오 · 네이버 토큰 교환은 서버에서만 한다. 브라우저는 인가 코드와 state 만 넘긴다.
 * refresh 토큰은 API 가 `member_refresh_token` 쿠키(Path=/api/public/{slug})로 심는다.
 */
import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

export type SocialProvider = 'KAKAO' | 'NAVER'

export interface SocialCallbackResult {
  status: 'LOGGED_IN' | 'SIGNUP_REQUIRED' | 'LINKED'
  provider: SocialProvider
  return_to: string
  access_token: string | null
  member: { id: string; name: string; email: string } | null
  signup_token: string | null
  email_required: boolean
  suggested_name: string | null
}

/** 추가 정보 화면(T-113 /member/join-social)으로 넘기는 값 — 주소창에 토큰을 남기지 않는다 */
export interface PendingSocialSignup {
  slug: string
  provider: SocialProvider
  signupToken: string
  emailRequired: boolean
  suggestedName: string | null
  returnTo: string
}

export const PENDING_SIGNUP_KEY = 'member_social_signup'

const memberApi = axios.create({
  baseURL: `${BASE_URL}/public`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

/** state = `{slug}.{난수}` — 공용 콜백 페이지가 테넌트를 찾는다 */
export const slugFromState = (state: string): string | null => {
  const slug = state.split('.', 1)[0]
  return state.includes('.') && /^[a-z0-9-]+$/.test(slug) ? slug : null
}

export const providerLabel = (provider: SocialProvider): string =>
  provider === 'KAKAO' ? '카카오' : '네이버'

/** 소셜 로그인 시작 — 서버가 만든 로그인 주소로 이동 */
export const fetchSocialAuthorizeUrl = async (
  slug: string,
  provider: SocialProvider,
  returnTo?: string,
): Promise<string> => {
  const { data } = await memberApi.get<{ data: { authorize_url: string } }>(
    `/${slug}/auth/social/${provider.toLowerCase()}/authorize`,
    { params: returnTo ? { return_to: returnTo } : undefined },
  )
  return data.data.authorize_url
}

/** 콜백 페이지 — 인가 코드 처리 (공급자는 서버가 state 에서 찾는다) */
export const completeSocialCallback = async (
  slug: string,
  code: string,
  state: string,
): Promise<SocialCallbackResult> => {
  const { data } = await memberApi.post<{ data: SocialCallbackResult }>(
    `/${slug}/auth/social`,
    { code, state },
  )
  return data.data
}

/** API 공통 에러 형식(기획서 5.1)의 사용자 메시지 */
export const socialErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { error?: { message?: string } } | undefined)
      ?.error?.message
    if (message) return message
  }
  return '소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요'
}

export const savePendingSignup = (pending: PendingSocialSignup): void => {
  try {
    window.sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(pending))
  } catch {
    // 시크릿 모드 등 저장소를 쓸 수 없으면 추가 정보 화면에서 다시 로그인을 안내한다
  }
}

export const loadPendingSignup = (): PendingSocialSignup | null => {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SIGNUP_KEY)
    return raw ? (JSON.parse(raw) as PendingSocialSignup) : null
  } catch {
    return null
  }
}

export const clearPendingSignup = (): void => {
  try {
    window.sessionStorage.removeItem(PENDING_SIGNUP_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 무시
  }
}
