import { Navigate, useParams, useSearchParams } from 'react-router'
import { SITE_HOME } from '@/components/layout/navigation'

/**
 * 예전 콘텐츠 편집 주소 → 페이지 관리 (T-238). 홈페이지 편집 모드 · 리포트 링크가 아직 쓴다.
 * 섹션 주소는 홈 아래로 보내고, 섹션 편집 화면이 그 섹션의 페이지로 다시 맞춘다.
 */
export function ContentRedirect() {
  const { sectionId } = useParams<{ sectionId: string }>()
  const [searchParams] = useSearchParams()
  // 공통 설정은 사이트 관리로 옮겼다 (T-221) — 예전 '공통 설정 열기' 링크(T-125-F)
  if (searchParams.get('tab') === 'settings') return <Navigate to={SITE_HOME} replace />
  return (
    <Navigate
      to={sectionId ? `/admin/pages/home/sections/${sectionId}` : '/admin/pages/home'}
      replace
    />
  )
}
