import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { MenuSettingsCard } from '@/components/content/MenuSettingsCard'
import { SitePage } from '@/components/site/SitePage'

/** 사이트 관리 → 메뉴 관리 (T-221, SM-02) — 메뉴는 연결만, 페이지 내용은 콘텐츠 편집에서 */
export function SiteMenuPage() {
  return (
    <SitePage
      title="메뉴 관리"
      description="홈페이지 상단 메뉴의 이름 · 보이기 · 순서를 정해요. 메뉴를 숨겨도 페이지와 게시판은 지워지지 않습니다."
    >
      <ReadOnlyFieldset>
        <MenuSettingsCard />
      </ReadOnlyFieldset>
    </SitePage>
  )
}
