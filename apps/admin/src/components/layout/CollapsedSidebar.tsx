import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router'
import { ExternalLink, Layers, LogOut } from 'lucide-react'
import { ADMIN_NAVIGATION, isChildActive } from './navigation'
import { useAuthStore } from '@/stores/authStore'
import { useNavVisibility } from '@/lib/navItems'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

export function CollapsedSidebar() {
  const { pathname } = useLocation()
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const logout = useAuthStore((s) => s.logout)
  const isVisible = useNavVisibility()
  const [flyout, setFlyout] = useState<{ to: string; top: number; left: number } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLAnchorElement | null>(null)

  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null
  const visibleItems = ADMIN_NAVIGATION.filter(({ to }) => isVisible(to))
  const activeItem = visibleItems.find(({ to }) => to === flyout?.to)

  const cancelClose = () => {
    clearTimeout(closeTimer.current)
  }
  const close = () => {
    cancelClose()
    setFlyout(null)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setFlyout(null), 120)
  }
  const open = (to: string, trigger: HTMLAnchorElement) => {
    cancelClose()
    triggerRef.current = trigger
    const rect = trigger.getBoundingClientRect()
    // Leave room for the whole group even near the bottom of a short viewport.
    const item = visibleItems.find((entry) => entry.to === to)
    const height = item?.children ? 64 + item.children.length * 40 : 56
    setFlyout({
      to,
      left: rect.right,
      top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)),
    })
  }
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (
      panelRef.current?.contains(event.relatedTarget) ||
      event.relatedTarget === triggerRef.current
    )
      return
    scheduleClose()
  }

  useEffect(() => {
    const dismiss = () => setFlyout(null)
    window.addEventListener('resize', dismiss)
    return () => {
      clearTimeout(closeTimer.current)
      window.removeEventListener('resize', dismiss)
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <aside className="admin-sidebar flex h-full min-h-0 w-20 flex-col items-center border-r border-slate-200 bg-white py-3">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
        <Layers size={23} />
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto"
        onScroll={close}
      >
        {visibleItems.map(({ to, icon: Icon, label, children }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            aria-expanded={flyout?.to === to}
            aria-controls={flyout?.to === to ? 'collapsed-sidebar-flyout' : undefined}
            onMouseEnter={(event) => open(to, event.currentTarget)}
            onMouseLeave={scheduleClose}
            onFocus={(event) => open(to, event.currentTarget)}
            onBlur={onBlur}
            onClick={close}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close()
              if (event.key === 'ArrowRight' && flyout?.to === to) {
                event.preventDefault()
                panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()
              }
            }}
            className={({ isActive }) =>
              [
                'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                isActive ||
                children?.some(
                  (child) => pathname === child.to || pathname.startsWith(`${child.to}/`)
                )
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')
            }
          >
            <Icon size={18} aria-hidden="true" />
          </NavLink>
        ))}
      </nav>

      {flyout &&
        activeItem &&
        createPortal(
          <div
            ref={panelRef}
            id="collapsed-sidebar-flyout"
            className="admin-sidebar-flyout"
            style={{ top: flyout.top, left: flyout.left }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onFocus={cancelClose}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.key === 'Escape' || event.key === 'ArrowLeft') {
                event.preventDefault()
                triggerRef.current?.focus()
                close()
              }
            }}
          >
            <nav
              aria-label={`${activeItem.label} 바로가기`}
              className="rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
            >
              {activeItem.children ? (
                <>
                  <p className="border-b border-slate-100 px-3 pb-3 pt-2 text-sm font-semibold text-slate-800">
                    {activeItem.label}
                  </p>
                  <div className="mt-1 space-y-1">
                    {activeItem.children.map(({ to, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={close}
                        className={() =>
                          `block rounded-lg px-3 py-2.5 text-sm ${isChildActive(pathname, to, activeItem.children ?? []) ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`
                        }
                      >
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </>
              ) : (
                <NavLink
                  to={activeItem.to}
                  onClick={close}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  {activeItem.label}
                </NavLink>
              )}
            </nav>
          </div>,
          document.body
        )}

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
