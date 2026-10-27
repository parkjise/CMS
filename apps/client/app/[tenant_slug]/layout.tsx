import { notoSansKr } from '@/lib/fonts'
import TenantShell, { generateMetadata, type Props } from './TenantShell'

export { generateMetadata }

/** 테마형 템플릿 · 공통 화면 — 테넌트 공통 레이아웃 + Noto Sans KR (T-125) */
export default function TenantLayout({ children, params }: Props) {
  return (
    <TenantShell params={params}>
      {/* 글꼴 변수(--font-noto-kr) 범위 — 박스를 만들지 않는 래퍼 */}
      <div className={`${notoSansKr.variable} contents`}>{children}</div>
    </TenantShell>
  )
}
