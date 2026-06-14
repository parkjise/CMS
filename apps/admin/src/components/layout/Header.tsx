import { useAuthStore } from '@/stores/authStore'

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
}

export function Header() {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)

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
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {PLAN_LABEL['FREE']}
        </span>
      </div>

      <div className="flex-1" />

      {user && (
        <span className="hidden text-xs text-slate-400 sm:block">
          {user.role === 'TENANT_ADMIN' ? '관리자' : '뷰어'}
        </span>
      )}
    </header>
  )
}
