import { NavLink } from 'react-router'
import { X, ExternalLink, LayoutDashboard, FileText, Share2, MessageSquare, Search, Layers, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/content', icon: FileText, label: '콘텐츠 편집' },
  { to: '/admin/sns', icon: Share2, label: 'SNS 설정' },
  { to: '/admin/inquiries', icon: MessageSquare, label: '문의 관리' },
  { to: '/admin/seo', icon: Search, label: 'SEO 설정' },
  { to: '/admin/templates', icon: Layers, label: '템플릿' },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const logout = useAuthStore((s) => s.logout)

  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 flex flex-col h-full bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 shrink-0">
        <span className="text-lg font-bold text-blue-600">CMS Admin</span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="사이드바 닫기"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')
            }
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 space-y-1 shrink-0">
        {homepageUrl && (
          <a
            href={homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <ExternalLink size={16} aria-hidden="true" />
            내 홈페이지 바로가기
          </a>
        )}
        <div className="px-3 py-1">
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={16} aria-hidden="true" />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
