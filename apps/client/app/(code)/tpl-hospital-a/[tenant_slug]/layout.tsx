// 템플릿 전용 라우트도 테넌트 공통 레이아웃(메타 · 색상 변수 · 로그인 상태)을 그대로 쓴다
// 테마형 글꼴(Noto Sans KR)은 빼고 — 템플릿이 자체 글꼴을 불러온다 (T-125)
export { default, generateMetadata } from '../../../[tenant_slug]/TenantShell'
