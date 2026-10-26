import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import MemberProviders from '@/components/member/MemberProviders'
import { fetchPublicSite } from '@/lib/publicSite'
import { memberEnabled } from '@/lib/publicSite.types'

// 방문자 회원 화면은 검색 노출 제외 (T-113)
export const metadata: Metadata = { robots: { index: false, follow: false } }

interface Props {
  children: React.ReactNode
  params: Promise<{ tenant_slug: string }>
}

export default async function MemberLayout({ children, params }: Props) {
  const { tenant_slug } = await params
  // 사이트가 없거나 회원 기능(SITE_MEMBER)이 꺼져 있으면 404 (T-115)
  if (!memberEnabled(await fetchPublicSite(tenant_slug))) notFound()
  return <MemberProviders>{children}</MemberProviders>
}
