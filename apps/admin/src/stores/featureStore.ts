import { create } from 'zustand'
import { api } from '@/lib/api'

/** 테넌트에 활성화된 기능의 메뉴 메타 (GET /api/v1/tenant/features 의 features 배열) */
export interface ActiveFeature {
  key: string
  name: string
  menu_path: string | null
  menu_icon: string | null
  menu_label: string | null
  menu_position: number
  is_beta: boolean
  release_note: string | null
  released_at: string | null
}

export type AnnouncementType =
  | 'INFO'
  | 'WARNING'
  | 'URGENT'
  | 'FEATURE_UPDATE'
  | 'MAINTENANCE'

export interface Announcement {
  id: string
  title: string
  type: AnnouncementType
  content: string
  is_read: boolean
}

interface TenantFeaturesResponse {
  flags: Record<string, boolean>
  features: ActiveFeature[]
  announcements: Announcement[]
}

/** NEW 뱃지 노출 기간 (released_at 기준 7일) */
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

interface FeatureState {
  flags: Record<string, boolean>
  features: ActiveFeature[]
  announcements: Announcement[]
  loaded: boolean
  isLoading: boolean

  /** 앱 초기화 시 1회 호출 — 기능 플래그/공지 로드 */
  load: () => Promise<void>
  /** 기능 활성화 여부 (CLAUDE.md 8.2 — plan 직접 체크 금지, 항상 이 헬퍼 경유) */
  isEnabled: (key: string) => boolean
  isBeta: (key: string) => boolean
  /** released_at 이 7일 이내면 NEW */
  isNew: (key: string) => boolean
  /** 공지 읽음 처리 (낙관적 제거) */
  markAnnouncementRead: (id: string) => Promise<void>
  reset: () => void
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  flags: {},
  features: [],
  announcements: [],
  loaded: false,
  isLoading: false,

  load: async () => {
    if (get().isLoading) return
    set({ isLoading: true })
    try {
      const { data } = await api.get('/v1/tenant/features')
      const payload = data.data as TenantFeaturesResponse
      set({
        flags: payload.flags ?? {},
        features: payload.features ?? [],
        announcements: payload.announcements ?? [],
        loaded: true,
      })
    } catch {
      // 실패 시 loaded=false 유지 → 메뉴는 graceful하게 전부 노출된다.
      set({ loaded: false })
    } finally {
      set({ isLoading: false })
    }
  },

  isEnabled: (key) => get().flags[key] === true,

  isBeta: (key) => get().features.find((f) => f.key === key)?.is_beta === true,

  isNew: (key) => {
    const feature = get().features.find((f) => f.key === key)
    if (!feature?.released_at) return false
    const releasedAt = new Date(feature.released_at).getTime()
    if (Number.isNaN(releasedAt)) return false
    return Date.now() - releasedAt <= NEW_WINDOW_MS
  },

  markAnnouncementRead: async (id) => {
    // 공지 읽음 API는 T-088에서 제공 — 실패해도 UI는 낙관적으로 제거한다.
    try {
      await api.post(`/v1/announcements/${id}/read`)
    } catch {
      // 무시: 미구현/오류여도 로컬 상태는 갱신
    }
    set((state) => ({
      announcements: state.announcements.filter((a) => a.id !== id),
    }))
  },

  reset: () =>
    set({
      flags: {},
      features: [],
      announcements: [],
      loaded: false,
      isLoading: false,
    }),
}))
