import { useState } from 'react'
import { NavLink } from 'react-router'
import {
  CreditCard,
  ExternalLink,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Search,
  Share2,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useNavVisibility } from '@/lib/navItems'

const CLIENT_BASE_URL =
  import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

const PRIMARY = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/content', icon: FileText, label: '콘텐츠' },
  { to: '/admin/inquiries', icon: MessageSquare, label: '문의' },
] as const

const OVERFLOW = [
  { to: '/admin/sns', icon: Share2, label: 'SNS 설정' },
  { to: '/admin/seo', icon: Search, label: 'SEO 설정' },
  { to: '/admin/templates', icon: Layers, label: '템플릿' },
  { to: '/admin/billing', icon: CreditCard, label: '요금제' },
] as const

export function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const logout = useAuthStore((s) => s.logout)
  const isVisible = useNavVisibility()
  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null
  const primaryItems = PRIMARY.filter(({ to }) => isVisible(to))
  const overflowItems = OVERFLOW.filter(({ to }) => isVisible(to))

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <>
      {/* 하단 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        {primaryItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs',
                isActive ? 'text-blue-600' : 'text-slate-500',
              ].join(' ')
            }
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs text-slate-500"
        >
          <MoreHorizontal size={20} aria-hidden="true" />
          더보기
        </button>
      </nav>

      {/* 더보기 시트 */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">메뉴</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-0.5">
              {overflowItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-700 hover:bg-slate-100',
                    ].join(' ')
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </div>

            <div className="mt-3 space-y-0.5 border-t border-slate-200 pt-3">
              {homepageUrl && (
                <a
                  href={homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-blue-600 hover:bg-blue-50"
                  onClick={() => setMoreOpen(false)}
                >
                  <ExternalLink size={18} />
                  내 홈페이지 바로가기
                </a>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut size={18} />
                로그아웃
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
