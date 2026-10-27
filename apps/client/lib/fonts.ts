import { Noto_Sans_KR } from 'next/font/google'

/**
 * 테마형 템플릿 · 공통 화면 글꼴 (T-125).
 * 한글 글꼴은 글리프 구간별 @font-face 가 많아(약 150KB) 화면 표시를 막는 CSS 가 커진다.
 * 루트 레이아웃이 아니라 이 글꼴을 쓰는 라우트에서만 불러온다 — 코드형 템플릿(/tpl-*)은 자체 글꼴 사용.
 */
export const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-noto-kr',
  preload: true,
})
