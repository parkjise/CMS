import type { Metadata } from 'next'
import { Suspense } from 'react'
import MemberShell from '@/components/member/MemberShell'
import WithdrawFlow from '@/components/member/WithdrawFlow'
import { siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '회원 탈퇴' }

export default async function Page({ params }: MemberPageProps) {
  const { tenant_slug } = await params
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="회원 탈퇴">
      <Suspense fallback={null}>
        <WithdrawFlow slug={tenant_slug} />
      </Suspense>
    </MemberShell>
  )
}
