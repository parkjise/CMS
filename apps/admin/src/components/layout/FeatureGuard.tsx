import type { ReactNode } from 'react'
import { useFeatureStore } from '@/stores/featureStore'
import { FeatureDisabledPage } from '@/pages/FeatureDisabledPage'

interface FeatureGuardProps {
  feature: string
  children: ReactNode
}

/**
 * 비활성 기능 페이지에 직접 URL로 접근하는 것을 차단한다.
 * - featureStore 로드 전(loaded=false)에는 통과시켜 깜빡임/오차단을 막는다.
 * - 로드 완료 후 기능이 꺼져 있으면 안내 페이지를 노출한다.
 */
export function FeatureGuard({ feature, children }: FeatureGuardProps) {
  const loaded = useFeatureStore((s) => s.loaded)
  const isEnabled = useFeatureStore((s) => s.isEnabled)

  if (loaded && !isEnabled(feature)) {
    return <FeatureDisabledPage />
  }
  return <>{children}</>
}
