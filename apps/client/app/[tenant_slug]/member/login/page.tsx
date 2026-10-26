import type { Metadata } from 'next'
import MemberShell from '@/components/member/MemberShell'
import MemberLoginForm from '@/components/member/MemberLoginForm'
import { firstParam, siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '로그인' }

export default async function Page({ params, searchParams }: MemberPageProps) {
  const { tenant_slug } = await params
  const query = await searchParams
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="로그인">
      <MemberLoginForm slug={tenant_slug} next={firstParam(query.next)} />
    </MemberShell>
  )
}
