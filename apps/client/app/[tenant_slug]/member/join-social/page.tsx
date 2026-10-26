import type { Metadata } from 'next'
import MemberShell from '@/components/member/MemberShell'
import JoinSocialForm from '@/components/member/JoinSocialForm'
import { siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '추가 정보 입력' }

export default async function Page({ params }: MemberPageProps) {
  const { tenant_slug } = await params
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="추가 정보 입력">
      <JoinSocialForm slug={tenant_slug} />
    </MemberShell>
  )
}
