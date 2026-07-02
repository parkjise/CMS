import { NavLink } from 'react-router'
import {
  BarChart3,
  CreditCard,
  ExternalLink,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Search,
  Share2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useNavVisibility } from '@/lib/navItems'

const CLIENT_BASE_URL =
  import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/content', icon: FileText, label: '콘텐츠' },
  { to: '/admin/sns', icon: Share2, label: 'SNS' },
  { to: '/admin/inquiries', icon: MessageSquare, label: '문의' },
  { to: '/admin/seo', icon: Search, label: 'SEO' },
  { to: '/admin/templates', icon: Layers, label: '템플릿' },
  { to: '/admin/analytics', icon: BarChart3, label: '분석' },
  { to: '/admin/billing', icon: CreditCard, label: '요금제' },
]

export function CollapsedSidebar() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const logout = useAuthStore((s) => s.logout)
  const isVisible = useNavVisibility()

  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null
  const visibleItems = NAV_ITEMS.filter(({ to }) => isVisible(to))

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-slate-200 bg-white py-3">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
        C
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              [
                'group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')
            }
          >
            <Icon size={18} aria-hidden="true" />
            <span className="sr-only">{label}</span>
            {/* tooltip */}
            <span className="pointer-events-none absolute left-12 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:block group-hover:opacity-100 group-focus-visible:block group-focus-visible:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 pt-2">
        {homepageUrl && (
          <a
            href={homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="내 홈페이지"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50"
          >
            <ExternalLink size={16} aria-hidden="true" />
            <span className="sr-only">내 홈페이지 바로가기</span>
          </a>
        )}
        <button
          onClick={handleLogout}
          title="로그아웃"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut size={16} aria-hidden="true" />
          <span className="sr-only">로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
