/**
 * 게시판 글 공개 API (T-139) — /api/public/site/{slug}/boards/{board}/posts
 * 서버 컴포넌트에서 읽는다. 사이트와 같은 캐시 태그라 글을 저장하면 바로 비워진다.
 */
import type { PublicPost, PublicPostList } from '@cms/types'
import { serverApiBase } from './apiBase'

const REVALIDATE_SECONDS = 60

export const NOTICE_BOARD = 'notice'

async function getJson<T>(tenantSlug: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${serverApiBase()}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [`site:${tenantSlug}`] },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data: T }
    return body.data
  } catch (error) {
    console.error('[publicPosts] request failed', { path, error })
    return null
  }
}

const postsPath = (tenantSlug: string, board: string) =>
  `/public/site/${encodeURIComponent(tenantSlug)}/boards/${encodeURIComponent(board)}/posts`

export function fetchPublicPosts(
  tenantSlug: string,
  board: string,
  { page = 1, size = 10, q, order }: { page?: number; size?: number; q?: string; order?: 'latest' },
): Promise<PublicPostList | null> {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (q) params.set('q', q)
  if (order) params.set('order', order)
  return getJson<PublicPostList>(tenantSlug, `${postsPath(tenantSlug, board)}?${params.toString()}`)
}

export function fetchPublicPost(
  tenantSlug: string,
  board: string,
  postId: string,
): Promise<PublicPost | null> {
  return getJson<PublicPost>(tenantSlug, `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}`)
}

/** 공개일 YYYY-MM-DD (한국 시간) */
export const postDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
