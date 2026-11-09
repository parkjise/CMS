import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  NOT_FOUND_META,
  renderThemeBoard,
  themeBoardMetadata,
} from '@/components/board/ThemeBoardRoute'
import { NOTICE_BOARD } from '@/lib/publicPosts'

interface Props {
  params: Promise<{ tenant_slug: string; path: string[] }>
  searchParams: Promise<{ q?: string; p?: string; c?: string }>
}

/**
 * 새 게시판 — 테마형 템플릿 (T-141). 코드형은 미들웨어가 템플릿 라우트로 보낸다.
 * 없는 주소의 404 상태 코드는 미들웨어가 맡는다 — 여기는 스트리밍이라 상태를 못 바꾼다.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug, path } = await params
  // 공지는 /notice 가 있어 /b/notice 는 404 (T-176)
  if (path[0] === NOTICE_BOARD) return NOT_FOUND_META
  return themeBoardMetadata(tenant_slug, path)
}

export default async function ThemeBoardPage({ params, searchParams }: Props) {
  const { tenant_slug, path } = await params
  if (path[0] === NOTICE_BOARD) notFound()
  return renderThemeBoard(tenant_slug, path, await searchParams)
}
