import type { Metadata } from 'next'
import { Suspense } from 'react'
import MemberShell from '@/components/member/MemberShell'
import RequireMember from '@/components/member/RequireMember'
import MypageView from '@/components/member/mypage/MypageView'
import { siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '마이페이지' }

export default async function Page({ params }: MemberPageProps) {
  const { tenant_slug } = await params
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="마이페이지" wide>
      <Suspense fallback={null}>
        <RequireMember slug={tenant_slug}>
          <MypageView slug={tenant_slug} />
        </RequireMember>
      </Suspense>
    </MemberShell>
  )
}
