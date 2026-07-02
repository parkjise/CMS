import { useFeatureStore } from '@/stores/featureStore'

/**
 * 라우트별로 요구되는 기능 플래그 키.
 * 여기에 없는 라우트(dashboard·sns·inquiries·billing)는 항상 노출된다.
 */
export const NAV_FEATURE_MAP: Record<string, string> = {
  '/admin/content': 'SECTION_EDITOR',
  '/admin/seo': 'SEO_WIZARD',
  '/admin/templates': 'TEMPLATE_SELECT',
  '/admin/analytics': 'NAVER_ANALYTICS',
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
