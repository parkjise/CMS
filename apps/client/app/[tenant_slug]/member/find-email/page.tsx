import type { Metadata } from 'next'
import MemberShell from '@/components/member/MemberShell'
import FindEmailForm from '@/components/member/FindEmailForm'
import { siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '이메일 찾기' }

export default async function Page({ params }: MemberPageProps) {
  const { tenant_slug } = await params
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="이메일 찾기" subtitle="가입 시 등록한 정보로 찾을 수 있어요.">
      <FindEmailForm slug={tenant_slug} />
    </MemberShell>
  )
}
