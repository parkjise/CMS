import '@/lib/fonts'
import TenantShell, { generateMetadata, type Props } from './TenantShell'

export { generateMetadata }

/** 테마형 템플릿 · 공통 화면 — 테넌트 공통 레이아웃 + Noto Sans KR (T-125) */
export default function TenantLayout({ children, params }: Props) {
  return (
    <TenantShell params={params}>{children}</TenantShell>
  )
}
