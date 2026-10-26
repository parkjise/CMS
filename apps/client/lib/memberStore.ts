'use client'

/**
 * 방문자 회원 스토어 (T-113, 기획서 16.0) — 어드민 편집용 authStore 와 분리.
 *
 * - access token 은 메모리에만. 새로고침하면 refresh 쿠키로 다시 받는다 (initialize)
 * - refresh 쿠키는 HttpOnly 라 읽을 수 없으므로, 로그인한 적이 있는 테넌트만
 *   localStorage 표시(`member_session:{slug}`)를 보고 refresh 를 호출한다
 *   (비회원 방문마다 401 요청을 보내지 않기 위함 — 토큰은 저장하지 않음)
 */
import { create } from 'zustand'
import {
  logout as logoutApi,
  refreshSession,
  type MemberSession,
  type MemberSummary,
} from './memberAuth'

const markerKey = (slug: string) => `member_session:${slug}`

const readMarker = (slug: string): boolean => {
  try {
    return window.localStorage.getItem(markerKey(slug)) === '1'
  } catch {
    return false
  }
}

const writeMarker = (slug: string, on: boolean) => {
  try {
    if (on) window.localStorage.setItem(markerKey(slug), '1')
    else window.localStorage.removeItem(markerKey(slug))
  } catch {
    // 저장소를 쓸 수 없으면 새로고침 후 로그인 상태만 다시 확인하지 않는다
  }
}

type Status = 'idle' | 'loading' | 'ready'

interface MemberStore {
  slug: string | null
  member: MemberSummary | null
  accessToken: string | null
  status: Status

  /** 페이지 로드 시 — 이 테넌트에 로그인한 적이 있으면 refresh 쿠키로 복원 */
  initialize: (slug: string) => Promise<void>
  /** 로그인 · 가입 · 토큰 갱신 결과 저장 */
  setSession: (slug: string, session: MemberSession) => void
  /** 비밀번호 변경 등으로 새 access token 만 받았을 때 (T-114) */
  setAccessToken: (token: string) => void
  logout: () => Promise<void>
  /** 탈퇴 · refresh 실패 등 서버 세션이 끝났을 때 */
  clear: () => void
}

export const useMemberStore = create<MemberStore>((set, get) => ({
  slug: null,
  member: null,
  accessToken: null,
  status: 'idle',

  initialize: async (slug) => {
    const current = get()
    if (current.slug === slug && current.status !== 'idle') return
    if (!readMarker(slug)) {
      set({ slug, member: null, accessToken: null, status: 'ready' })
      return
    }
    set({ slug, status: 'loading' })
    try {
      const session = await refreshSession(slug)
      set({ member: session.member, accessToken: session.access_token, status: 'ready' })
    } catch {
      writeMarker(slug, false)
      set({ member: null, accessToken: null, status: 'ready' })
    }
  },

  setSession: (slug, session) => {
    writeMarker(slug, true)
    set({ slug, member: session.member, accessToken: session.access_token, status: 'ready' })
  },

  setAccessToken: (token) => set({ accessToken: token }),

  logout: async () => {
    const { slug, accessToken } = get()
    if (slug && accessToken) {
      try {
        await logoutApi(slug, accessToken)
      } catch {
        // 서버 로그아웃 실패여도 화면은 로그아웃 상태로
      }
    }
    get().clear()
  },

  clear: () => {
    const { slug } = get()
    if (slug) writeMarker(slug, false)
    set({ member: null, accessToken: null, status: 'ready' })
  },
}))

/** 이 테넌트에 로그인돼 있는지 (다른 테넌트 세션은 무시) */
export const useIsMember = (slug: string): boolean =>
  useMemberStore((s) => s.slug === slug && s.member !== null)

/** JWT exp(초) — 서명 확인 없이 만료 시각만 읽는다 (서버가 다시 검증) */
const tokenExpiresAt = (token: string): number => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

/**
 * 공개 접수(문의 · 상담 · 예약)에 붙일 방문자 토큰 헤더 (T-115)
 * 로그인한 회원이면 내 문의 · 내 예약에 연결된다. 만료됐으면 refresh 쿠키로 먼저 갱신,
 * 실패하거나 비회원이면 빈 헤더 (비회원 접수 — 오픈 이슈 #23 옵션 A).
 */
export const memberAuthHeader = async (slug: string): Promise<Record<string, string>> => {
  const state = useMemberStore.getState()
  if (state.slug !== slug || !state.member || !state.accessToken) return {}
  let token = state.accessToken
  if (tokenExpiresAt(token) - Date.now() < 30_000) {
    try {
      const session = await refreshSession(slug)
      state.setSession(slug, session)
      token = session.access_token
    } catch {
      return {}
    }
  }
  return { Authorization: `Bearer ${token}` }
}
