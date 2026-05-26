import type { Metadata } from 'next'
import './globals.css'

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
