import { ReadOnlyBanner } from '@/components/layout/ReadOnlyBanner'
import { useEffect, useRef, useState } from 'react'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { Outlet, useLocation } from 'react-router'
import { SkipLink } from '@/components/a11y/SkipLink'
import { useFeatureStore } from '@/stores/featureStore'
import { ReSubscribeBanner } from '@/components/billing/ReSubscribeBanner'
import { isSubscriptionBlocked, useSubscription } from '@/hooks/useBilling'
import { SubscriptionExpiredPage } from '@/pages/SubscriptionExpiredPage'
import { AnnouncementBanner } from './AnnouncementBanner'
import { BottomTabBar } from './BottomTabBar'
import { CollapsedSidebar } from './CollapsedSidebar'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TrialBanner } from './TrialBanner'
import { AppearanceDialog } from './AppearanceDialog'

export function AdminLayout() {
  const { mode, collapsed, setCollapsed } = useAppearanceStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const loadFeatures = useFeatureStore((s) => s.load)
  const { data: sub } = useSubscription()
  const { pathname } = useLocation()

  useEffect(() => {
    document.documentElement.dataset.tenantTheme = mode
    return () => {
      delete document.documentElement.dataset.tenantTheme
    }
  }, [mode])

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 })
  }, [pathname])

  const toggleMenu = () => {
    if (window.matchMedia('(min-width: 768px)').matches) setCollapsed(!collapsed)
    else setMobileOpen((open) => !open)
  }

  useEffect(() => {
    void loadFeatures()
  }, [loadFeatures])

  // 구독이 멈추면 결제 화면 말고는 막는다 — 결제 화면까지 막으면 재구독할 길이 없다 (T-134)
  if (isSubscriptionBlocked(sub) && pathname !== '/admin/billing') {
    return <SubscriptionExpiredPage />
  }

  return (
    <div className="tenant-admin flex h-dvh overflow-hidden bg-slate-50">
      <SkipLink />

      <div
        id="admin-sidebar"
        className={`hidden shrink-0 md:flex md:flex-col ${collapsed ? 'admin-nav-collapsed' : 'admin-nav-expanded'}`}
      >
        {collapsed ? <CollapsedSidebar /> : <Sidebar />}
      </div>
      {mobileOpen && (
        <AppearanceDialog title="관리 메뉴" onClose={() => setMobileOpen(false)} drawer>
          <Sidebar onClose={() => setMobileOpen(false)} />
        </AppearanceDialog>
      )}

      {/* 오른쪽 콘텐츠 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onToggleMenu={toggleMenu} menuExpanded={!collapsed} mobileExpanded={mobileOpen} />
        <main
          ref={contentRef}
          id="main-content"
          tabIndex={-1}
          className="admin-content min-h-0 flex-1 overflow-y-auto pb-20 focus:outline-none md:pb-0"
        >
          <ReadOnlyBanner />
          <TrialBanner />
          <ReSubscribeBanner />
          <AnnouncementBanner />
          <Outlet />
        </main>
      </div>

      {/* 모바일 <md: 하단 탭바 */}
      <div className="md:hidden">
        <BottomTabBar />
      </div>
    </div>
  )
}
