import type { ReactNode } from 'react'

interface SitePageProps {
  title: string
  description: string
  children: ReactNode
}

/** 사이트 관리 화면 머리 (T-221) — 위치는 헤더의 '사이트 관리 / 화면' 경로가 알려 준다 */
export const SitePage = ({ title, description, children }: SitePageProps) => (
  <div className="space-y-6 p-6 md:p-8">
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
    {children}
  </div>
)

export const SITE_CARD =
  'space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6'
