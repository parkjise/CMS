import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { MenuTreeEditor } from '@/components/site/MenuTreeEditor'
import { SitePage } from '@/components/site/SitePage'

/** 사이트 관리 → 메뉴 관리 (T-221 · T-223, SM-02) — 메뉴는 연결만, 페이지 내용은 콘텐츠 편집에서 */
export function SiteMenuPage() {
  return (
    <SitePage
      title="메뉴 관리"
      description="메뉴는 콘텐츠를 연결하는 탐색 구조예요. 여기서는 페이지 본문을 편집하지 않아요. 메뉴를 지워도 페이지와 게시판은 그대로예요."
    >
      <ReadOnlyFieldset className="min-w-0">
        <MenuTreeEditor />
      </ReadOnlyFieldset>
    </SitePage>
  )
}
