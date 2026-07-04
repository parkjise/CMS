import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { SkipLink } from '@/components/a11y/SkipLink'
import { useFeatureStore } from '@/stores/featureStore'
import { AnnouncementBanner } from './AnnouncementBanner'
import { BottomTabBar } from './BottomTabBar'
import { CollapsedSidebar } from './CollapsedSidebar'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TrialBanner } from './TrialBanner'

export function AdminLayout() {
  const loadFeatures = useFeatureStore((s) => s.load)

  useEffect(() => {
    void loadFeatures()
  }, [loadFeatures])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <SkipLink />

      {/* 데스크톱 lg+: 전체 사이드바 */}
      <div className="hidden lg:flex lg:flex-col">
        <Sidebar />
      </div>

      {/* 태블릿 md~lg: 아이콘 사이드바 */}
      <div className="hidden md:flex md:flex-col lg:hidden">
        <CollapsedSidebar />
      </div>

      {/* 오른쪽 콘텐츠 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <TrialBanner />
        <AnnouncementBanner />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto pb-20 focus:outline-none md:pb-0"
        >
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
