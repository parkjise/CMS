import { redirect } from 'next/navigation'

// 루트 접근 시 — 기본 테넌트로 리다이렉트하거나 서비스 소개 페이지 표시
// 현재는 placeholder (T-005 초기 설정)
export default function RootPage() {
  redirect('/not-found')
}
