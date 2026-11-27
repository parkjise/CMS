import { ADMIN_NAVIGATION } from '@/components/layout/navigation'
import { useFeatureStore } from '@/stores/featureStore'

/**
 * 라우트별로 요구되는 기능 플래그 키.
 * 여기에 없는 라우트(dashboard·sns·inquiries·billing)는 항상 노출된다.
 * 2뎁스 메뉴도 같은 표로 거른다 — 사이트 관리의 검색 설정 3개 (T-221)
 */
export const NAV_FEATURE_MAP: Record<string, string> = {
  '/admin/pages': 'SECTION_EDITOR',
  '/admin/contents': 'CONTENT_MANAGE',
  '/admin/boards': 'BOARD_MANAGER',
  '/admin/site/seo': 'SEO_WIZARD',
  '/admin/site/aeo': 'SEO_WIZARD',
  '/admin/site/geo': 'SEO_WIZARD',
  '/admin/templates': 'TEMPLATE_SELECT',
  '/admin/analytics': 'NAVER_ANALYTICS',
  '/admin/reports': 'AI_MONTHLY_REPORT',
}

export type NavBadge = 'BETA' | 'NEW' | null

/**
 * 메뉴 노출 여부 판정 훅.
 * - 매핑된 기능이 없으면 항상 노출
 * - featureStore 로드 전/실패 시(loaded=false)에는 모든 메뉴 노출 (graceful degradation)
 * - 로드 성공 후에는 isEnabled 로 게이팅
 */
export function useNavVisibility(): (to: string) => boolean {
  const loaded = useFeatureStore((s) => s.loaded)
  const flags = useFeatureStore((s) => s.flags)

  return (to: string) => {
    const feature = NAV_FEATURE_MAP[to]
    if (!feature) return true
    if (!loaded) return true
    return flags[feature] === true
  }
}

/** 사이드바에 보이는 메뉴 — 2뎁스까지 거른다 (T-221) */
export function useVisibleNavigation() {
  const isVisible = useNavVisibility()
  return ADMIN_NAVIGATION.filter(({ to }) => isVisible(to)).map((item) =>
    item.children ? { ...item, children: item.children.filter(({ to }) => isVisible(to)) } : item
  )
}

/** 기능이 켜져 있는지 — 불러오기 전 · 실패 시에는 켜진 것으로 (서버가 다시 막는다) */
export function useFeatureOn(feature: string): boolean {
  const loaded = useFeatureStore((s) => s.loaded)
  const on = useFeatureStore((s) => s.flags[feature] === true)
  return !loaded || on
}

/** 메뉴에 표시할 뱃지(BETA 우선, 그다음 NEW) 반환 훅 */
export function useNavBadge(): (to: string) => NavBadge {
  const features = useFeatureStore((s) => s.features)

  return (to: string) => {
    const key = NAV_FEATURE_MAP[to]
    if (!key) return null
    const feature = features.find((f) => f.key === key)
    if (!feature) return null
    if (feature.is_beta) return 'BETA'
    if (feature.released_at) {
      const releasedAt = new Date(feature.released_at).getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (!Number.isNaN(releasedAt) && Date.now() - releasedAt <= sevenDays) {
        return 'NEW'
      }
    }
    return null
  }
}
