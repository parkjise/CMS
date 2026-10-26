import type { Metadata } from 'next'
import MemberShell from '@/components/member/MemberShell'
import FindPasswordForm from '@/components/member/FindPasswordForm'
import { siteNameOf, type MemberPageProps } from '../page-utils'

export const metadata: Metadata = { title: '비밀번호 재설정' }

export default async function Page({ params }: MemberPageProps) {
  const { tenant_slug } = await params
  return (
    <MemberShell slug={tenant_slug} siteName={await siteNameOf(tenant_slug)} title="비밀번호 재설정" subtitle="가입한 이메일과 휴대폰으로 본인 확인 후 새 비밀번호를 설정할 수 있어요.">
      <FindPasswordForm slug={tenant_slug} />
    </MemberShell>
  )
}
