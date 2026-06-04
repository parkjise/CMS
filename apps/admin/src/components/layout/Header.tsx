import { Menu } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
}

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)

  return (
    <header className="h-16 shrink-0 flex items-center gap-4 px-4 sm:px-6 bg-white border-b border-slate-200">
      {/* 모바일 햄버거 */}
      <button
        onClick={onMenuClick}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="메뉴 열기"
      >
        <Menu size={20} />
      </button>

      {/* 테넌트 정보 */}
      <div className="flex items-center gap-2 min-w-0">
        {tenantSlug && (
          <span className="text-sm font-semibold text-slate-800 truncate">{tenantSlug}</span>
        )}
        {/* 플랜 뱃지 — 추후 테넌트 API 연동 시 실제 플랜으로 교체 */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          {PLAN_LABEL['FREE']}
        </span>
      </div>

      <div className="flex-1" />

      {/* 유저 역할 */}
      {user && (
        <span className="hidden sm:block text-xs text-slate-400">
          {user.role === 'TENANT_ADMIN' ? '관리자' : '뷰어'}
        </span>
      )}
    </header>
  )
}
