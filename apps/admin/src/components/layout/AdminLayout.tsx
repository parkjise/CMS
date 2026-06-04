import { useState, useCallback } from 'react'
import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSidebar = useCallback(() => setSidebarOpen(true), [])

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* 데스크탑 사이드바 (항상 노출) */}
      <div className="hidden lg:flex lg:flex-col">
        <Sidebar />
      </div>

      {/* 모바일 사이드바 오버레이 */}
      {sidebarOpen && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
          {/* drawer */}
          <div className="fixed inset-y-0 left-0 z-30 flex flex-col w-60 lg:hidden">
            <Sidebar onClose={closeSidebar} />
          </div>
        </>
      )}

      {/* 오른쪽 콘텐츠 영역 */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header onMenuClick={openSidebar} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
