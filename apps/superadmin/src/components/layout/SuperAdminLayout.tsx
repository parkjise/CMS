import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  Bell,
  Building2,
  CreditCard,
  LayoutDashboard,
  LineChart,
  LogOut,
  ToggleRight,
  Wallet,
} from 'lucide-react'
import { useSuperAuthStore } from '@/stores/superAuthStore'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/tenants', icon: Building2, label: '테넌트 관리' },
  { to: '/features', icon: ToggleRight, label: '기능 배포' },
  { to: '/announcements', icon: Bell, label: '공지 관리' },
  { to: '/monitoring', icon: LineChart, label: '모니터링' },
  { to: '/revenue', icon: Wallet, label: '수익 관리' },
  { to: '/billing', icon: CreditCard, label: '결제 현황' },
]

export function SuperAdminLayout() {
  const navigate = useNavigate()
  const clearAuth = useSuperAuthStore((s) => s.clearAuth)
  const user = useSuperAuthStore((s) => s.user)

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-slate-900 text-slate-100">
        <div className="border-b border-slate-800 px-5 py-4">
          <span className="text-base font-bold">CMS 슈퍼 어드민</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <p className="mb-2 truncate px-3 text-xs text-slate-400">
            {user?.email ?? '운영자'}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
