import type { Metadata } from 'next'
import MemberShell from '@/components/member/MemberShell'
import ResetPasswordForm from '@/components/member/ResetPasswordForm'
import { firstParam, siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '새 비밀번호 설정' }

export default async function Page({ params, searchParams }: MemberPageProps) {
  const { tenant_slug } = await params
  const query = await searchParams
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="새 비밀번호 설정">
      <ResetPasswordForm slug={tenant_slug} token={firstParam(query.token) ?? ''} />
    </MemberShell>
  )
}
