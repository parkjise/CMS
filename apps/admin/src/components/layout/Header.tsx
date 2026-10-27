import { ExternalLink } from 'lucide-react'
import { useSubscription } from '@/hooks/useBilling'
import { useAuthStore } from '@/stores/authStore'

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
}

const CLIENT_BASE_URL =
  import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

export function Header() {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  // 실제 구독 요금제 (T-082-C) — AdminLayout 과 같은 쿼리라 요청이 늘지 않는다
  const { data: sub } = useSubscription()
  const planLabel = sub ? (PLAN_LABEL[sub.plan_type] ?? sub.plan_type) : null
  const isTrial = sub?.status === 'TRIAL'

  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:h-16 sm:px-6">
      {/* 모바일 로고 (사이드바가 숨겨진 경우) */}
      <span className="text-base font-bold text-blue-600 md:hidden">
        CMS Admin
      </span>

      {/* 테넌트 정보 */}
      <div className="hidden min-w-0 items-center gap-2 md:flex">
        {tenantSlug && (
          <span className="truncate text-sm font-semibold text-slate-800">
            {tenantSlug}
          </span>
        )}
        {/* 구독 정보가 없으면 틀린 값 대신 숨긴다 */}
        {planLabel && (
          <span
            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
            aria-label={`현재 요금제 ${planLabel}${isTrial ? ' 무료 체험 중' : ''}`}
          >
            {planLabel}
            {isTrial && ' · 체험 중'}
          </span>
        )}
      </div>

      <div className="flex-1" />

      {homepageUrl && (
        <a
          href={homepageUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="내 홈페이지 새 탭에서 열기"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">내 홈페이지 열기</span>
        </a>
      )}

      {user && (
        <span className="hidden text-xs text-slate-400 sm:block">
          {user.role === 'TENANT_ADMIN' ? '관리자' : '뷰어'}
        </span>
      )}
    </header>
  )
}
