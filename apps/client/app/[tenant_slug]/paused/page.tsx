import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SitePaused } from '@/components/layout/SitePaused'
import { fetchSiteAvailability } from '@/lib/siteAvailability'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

/**
 * 닫힌 홈페이지 안내 (T-201) — 미들웨어가 닫힌 사이트의 모든 주소를 여기로 rewrite 한다.
 * 열린 사이트에서 직접 열면 404. 검색엔진에는 내지 않는다.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await fetchSiteAvailability((await params).tenant_slug)
  return {
    title: site ? `${site.name} — 잠시 쉬는 중` : '페이지를 찾을 수 없습니다',
    robots: { index: false, follow: false },
  }
}

export default async function SitePausedPage({ params }: Props) {
  const site = await fetchSiteAvailability((await params).tenant_slug)
  if (site?.status !== 'PAUSED') notFound()
  return <SitePaused site={site} />
}
