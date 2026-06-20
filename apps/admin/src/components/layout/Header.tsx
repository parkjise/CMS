import { ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
}

const CLIENT_BASE_URL =
  import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

export function Header() {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)

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
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {PLAN_LABEL['FREE']}
        </span>
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
