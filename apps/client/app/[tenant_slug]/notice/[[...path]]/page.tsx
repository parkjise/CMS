import type { Metadata } from 'next'
import { renderThemeBoard, themeBoardMetadata } from '@/components/board/ThemeBoardRoute'
import { NOTICE_BOARD } from '@/lib/publicPosts'

interface Props {
  params: Promise<{ tenant_slug: string; path?: string[] }>
  searchParams: Promise<{ q?: string; p?: string; c?: string }>
}

/**
 * 공지 — 테마형 템플릿 (T-176). 코드형에서 바꾼 고객의 공지 글을 코드형과 같은 주소로 보여 준다.
 * 코드형은 미들웨어가 템플릿 라우트로 보낸다. 공지 게시판이 없으면 /b 처럼 404.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug, path = [] } = await params
  return themeBoardMetadata(tenant_slug, [NOTICE_BOARD, ...path])
}

export default async function ThemeNoticePage({ params, searchParams }: Props) {
  const { tenant_slug, path = [] } = await params
  return renderThemeBoard(tenant_slug, [NOTICE_BOARD, ...path], await searchParams)
}
