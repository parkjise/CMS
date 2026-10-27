import { Suspense } from 'react'
import type { Metadata } from 'next'
import SocialCallback from '@/components/member/SocialCallback'
import { notoSansKr } from '@/lib/fonts'

// 카카오 · 네이버 공용 콜백 (T-110, 오픈 이슈 #24 — 운영사 공용 앱의 등록 주소)
export const metadata: Metadata = {
  title: '로그인 중',
  robots: { index: false, follow: false },
}

export default function SocialCallbackPage() {
  return (
    <div className={`${notoSansKr.variable} contents`}>
      <Suspense fallback={null}>
        <SocialCallback />
      </Suspense>
    </div>
  )
}
