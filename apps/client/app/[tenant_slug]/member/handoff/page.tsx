import { Suspense } from 'react'
import type { Metadata } from 'next'
import SocialHandoff from '@/components/member/SocialHandoff'
import type { MemberPageProps } from '../page-utils'

export const metadata: Metadata = {
  title: '로그인 중',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: MemberPageProps) {
  const { tenant_slug } = await params
  return (
    <Suspense fallback={null}>
      <SocialHandoff slug={tenant_slug} />
    </Suspense>
  )
}
