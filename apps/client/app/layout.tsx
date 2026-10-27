import type { Metadata } from 'next'
import './globals.css'

// 글꼴(Noto Sans KR)은 쓰는 라우트에서만 — lib/fonts.ts (T-125)

export const metadata: Metadata = {
  title: 'CMS',
  description: '노코드 홈페이지 빌더',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
