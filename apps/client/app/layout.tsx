import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

// 글꼴(Noto Sans KR)은 쓰는 라우트에서만 — lib/fonts.ts (T-125)

export const metadata: Metadata = {
  title: 'CMS',
  description: '노코드 홈페이지 빌더',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        {/* 문의 접수 · 편집 모드 알림 (sonner) — 없으면 toast() 가 화면에 안 보인다 */}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  )
}
