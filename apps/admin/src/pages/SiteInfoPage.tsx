import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { SiteSettingsForm } from '@/components/content/SiteSettingsForm'
import { SitePage } from '@/components/site/SitePage'

/** 사이트 관리 → 사이트 기본정보 (T-221 · T-222, SM-01) — 콘텐츠 편집의 '공통 설정' 탭에서 옮겨 왔다 */
export function SiteInfoPage() {
  return (
    <SitePage
      title="사이트 기본정보"
      description="브랜드 · 사업자 · 연락처 · 운영시간을 한 번 입력하면 푸터 · 상담 버튼 · 검색 구조화 데이터 · 약관에 함께 쓰여요."
    >
      <ReadOnlyFieldset>
        <SiteSettingsForm />
      </ReadOnlyFieldset>
    </SitePage>
  )
}
