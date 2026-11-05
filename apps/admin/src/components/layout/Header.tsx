import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  ChevronRight,
  ExternalLink,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
} from 'lucide-react'
import { useSubscription } from '@/hooks/useBilling'
import { useAuthStore } from '@/stores/authStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useNavVisibility } from '@/lib/navItems'
import { AppearanceDialog } from './AppearanceDialog'
import { ADMIN_NAVIGATION, breadcrumbsFor } from './navigation'

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
}

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

export function Header({
  onToggleMenu,
  menuExpanded = true,
  mobileExpanded = false,
}: {
  onToggleMenu?: () => void
  menuExpanded?: boolean
  mobileExpanded?: boolean
}) {
  const user = useAuthStore((s) => s.user)
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const { data: sub } = useSubscription()
  const planLabel = sub?.plan_type ? (PLAN_LABEL[sub.plan_type] ?? sub.plan_type) : null
  const isTrial = sub?.status === 'TRIAL'
  const { pathname } = useLocation()
  const { mode, collapsed, setMode, setCollapsed } = useAppearanceStore()
  const [panel, setPanel] = useState<'search' | 'settings' | null>(null)
  const [query, setQuery] = useState('')
  const isVisible = useNavVisibility()
  const crumbs = breadcrumbsFor(pathname)
  const results = ADMIN_NAVIGATION.filter(({ to }) => isVisible(to))
    .flatMap((item) => [
      item,
      ...(item.children ?? []).map((child) => ({ ...child, icon: item.icon })),
    ])
    .filter((item, index, all) => all.findIndex(({ to }) => to === item.to) === index)
    .filter(({ label }) => label.toLowerCase().includes(query.trim().toLowerCase()))
  const closePanel = () => setPanel(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPanel((value) => (value === 'search' ? null : 'search'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="admin-header flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 sm:gap-4 sm:px-6">
        <button
          type="button"
          aria-label="메뉴 접기/펴기"
          aria-expanded={menuExpanded}
          aria-controls="admin-sidebar"
          className="admin-icon-button hidden md:inline-flex"
          onClick={onToggleMenu}
        >
          <Menu size={20} />
        </button>
        <button
          type="button"
          aria-label="관리 메뉴 열기"
          aria-expanded={mobileExpanded}
          className="admin-icon-button md:hidden"
          onClick={onToggleMenu}
        >
          <Menu size={20} />
        </button>
        <nav aria-label="브레드크럼" className="min-w-0 flex-1 overflow-x-auto">
          <ol className="flex items-center gap-2 whitespace-nowrap text-sm">
            <li className="hidden text-slate-400 sm:block">
              <Link to="/admin/dashboard">홈</Link>
            </li>
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                <ChevronRight
                  size={14}
                  className={`${index === 0 ? 'hidden sm:block' : ''} text-slate-300`}
                  aria-hidden
                />
                {index < crumbs.length - 1 && crumb.to ? (
                  <Link className="text-slate-400 hover:text-blue-600" to={crumb.to}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-800" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            className="admin-icon-button"
            aria-label="메뉴 검색"
            title="메뉴 검색 (⌘/Ctrl K)"
            onClick={() => {
              setQuery('')
              setPanel('search')
            }}
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            className="admin-icon-button"
            aria-label={mode === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
            onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
          >
            {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            type="button"
            className="admin-icon-button"
            aria-label="화면 설정"
            onClick={() => setPanel('settings')}
          >
            <Settings size={20} />
          </button>
          {tenantSlug && (
            <a
              href={`${CLIENT_BASE_URL}/${tenantSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="내 홈페이지 새 탭에서 열기"
              title="내 홈페이지 열기"
              className="admin-icon-button hidden sm:flex"
            >
              <ExternalLink size={18} />
            </a>
          )}
        </div>
        <div className="ml-1 hidden min-w-0 items-center gap-3 border-l border-slate-200 pl-4 sm:flex">
          <span className="admin-avatar">
            {(tenantSlug ?? user?.email ?? 'C').slice(0, 2).toUpperCase()}
          </span>
          <div className="hidden max-w-36 lg:block">
            <p className="truncate text-sm font-semibold text-slate-800">
              {tenantSlug ?? 'CMS Admin'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {user?.role === 'TENANT_VIEWER' ? '뷰어' : '관리자'}
              {planLabel && (
                <span aria-label={`현재 요금제 ${planLabel}${isTrial ? ' 무료 체험 중' : ''}`}>
                  {' '}
                  · {planLabel}
                  {isTrial ? ' · 체험 중' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
      </header>
      {panel === 'search' && (
        <AppearanceDialog title="메뉴 검색" onClose={closePanel}>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              autoFocus
              aria-label="검색어"
              placeholder="이동할 메뉴를 검색하세요..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-600"
            />
          </div>
          <p className="mb-2 text-xs font-medium text-slate-400">빠른 이동</p>
          <div className="space-y-1">
            {results.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={closePanel}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-600"
              >
                <Icon size={18} />
                {label}
                <ChevronRight size={16} className="ml-auto" />
              </Link>
            ))}
          </div>
          {results.length === 0 && (
            <p role="status" className="py-8 text-center text-sm text-slate-500">
              검색 결과가 없습니다.
            </p>
          )}
        </AppearanceDialog>
      )}
      {panel === 'settings' && (
        <AppearanceDialog title="화면 설정" onClose={closePanel} drawer>
          <p className="mb-7 text-sm text-slate-500">관리 화면을 편한 모습으로 설정하세요.</p>
          <fieldset className="mb-8">
            <legend className="mb-3 text-sm font-semibold text-slate-800">테마 모드</legend>
            <div className="grid grid-cols-2 gap-3">
              {(['light', 'dark'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={`admin-setting-option ${mode === value ? 'is-selected' : ''}`}
                >
                  {value === 'light' ? <Sun size={24} /> : <Moon size={24} />}
                  {value === 'light' ? '라이트 모드' : '다크 모드'}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mb-8">
            <legend className="mb-3 text-sm font-semibold text-slate-800">사이드바</legend>
            <div className="grid grid-cols-2 gap-3">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={collapsed === value}
                  onClick={() => setCollapsed(value)}
                  className={`admin-setting-option ${collapsed === value ? 'is-selected' : ''}`}
                >
                  {value ? <PanelLeftClose size={24} /> : <PanelLeftOpen size={24} />}
                  {value ? '아이콘 메뉴' : '전체 메뉴'}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">
            <Monitor size={20} className="mt-1 shrink-0" />
            <p>
              헤더와 사이드바는 고정되며 콘텐츠 영역만 스크롤됩니다. 설정은 이 브라우저에 자동
              저장됩니다.
            </p>
          </div>
          <button
            type="button"
            className="mt-6 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => {
              setMode('light')
              setCollapsed(false)
            }}
          >
            기본 설정으로 초기화
          </button>
        </AppearanceDialog>
      )}
    </>
  )
}
