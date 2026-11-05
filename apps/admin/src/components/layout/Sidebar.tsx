import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { ChevronDown, X, ExternalLink, LogOut, Layers } from 'lucide-react'
import { ADMIN_NAVIGATION } from './navigation'
import type { LucideIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useNavBadge, useNavVisibility } from '@/lib/navItems'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

interface NavChild {
  to: string
  label: string
}

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  /** 있으면 눌러서 펼치는 2뎁스 메뉴 — 항목 자체는 이동하지 않는다 */
  children?: NavChild[]
}

interface SidebarProps {
  onClose?: () => void
}

const itemClass = (isActive: boolean) =>
  [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-blue-50 text-blue-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ')

interface NavGroupProps {
  item: NavItem
  children: NavChild[]
  onNavigate?: () => void
}

/** 눌러서 펼치는 메뉴 — 그 안의 화면에 있으면 펼친 채로 */
function NavGroup({ item, children, onNavigate }: NavGroupProps) {
  const { pathname } = useLocation()
  const inside = children.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
  const [open, setOpen] = useState(inside)
  const Icon = item.icon
  const listId = `nav-group-${item.to.replaceAll('/', '-')}`

  useEffect(() => {
    if (inside) setOpen(true)
  }, [inside])

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`w-full ${itemClass(false)}${inside ? ' !text-blue-700' : ''}`}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul id={listId} className="mt-0.5 space-y-0.5">
          {children.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    'block rounded-lg py-2 pl-10 pr-3 text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Sidebar({ onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const logout = useAuthStore((s) => s.logout)
  const isVisible = useNavVisibility()
  const badgeOf = useNavBadge()

  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null
  const visibleItems = ADMIN_NAVIGATION.filter(({ to }) => isVisible(to))

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <aside className="admin-sidebar w-64 flex flex-col h-full min-h-0 bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
            <Layers size={21} />
          </span>
          <div>
            <span className="text-lg font-bold tracking-tight text-blue-600">CMS</span>
            <p className="text-[10px] tracking-widest text-slate-400">TENANT ADMIN</p>
          </div>
        </div>
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
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-widest text-slate-400">
          WORKSPACE
        </p>
        {visibleItems.map((item) => {
          const { to, icon: Icon, label, children } = item
          if (children)
            return <NavGroup key={to} item={item} children={children} onNavigate={onClose} />
          const badge = badgeOf(to)
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => itemClass(isActive)}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {badge === 'BETA' && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  BETA
                </span>
              )}
              {badge === 'NEW' && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  NEW
                </span>
              )}
            </NavLink>
          )
        })}
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
            <ExternalLink size={16} aria-hidden="true" />내 홈페이지 바로가기
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
