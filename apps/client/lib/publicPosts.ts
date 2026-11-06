/**
 * 게시판 글 공개 API (T-139) — /api/public/site/{slug}/boards/{board}/posts
 * 서버 컴포넌트에서 읽는다. 사이트와 같은 캐시 태그라 글을 저장하면 바로 비워진다.
 */
import type { PublicFieldValue, PublicPost, PublicPostList, PublicSitemapPost } from '@cms/types'
import { serverApiBase } from './apiBase'

const REVALIDATE_SECONDS = 60

export const NOTICE_BOARD = 'notice'

/** 새 게시판 주소 /{slug}/b/{게시판}[/{글}] (T-140-B) */
export const BOARD_PATH = 'b'
export const boardPageKey = (boardSlug: string): string => `${BOARD_PATH}/${boardSlug}`

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
  {
    page = 1,
    size,
    q,
    order,
    category,
  }: { page?: number; size?: number; q?: string; order?: 'latest'; category?: string },
): Promise<PublicPostList | null> {
  // 크기를 안 보내면 서버가 게시판 설정대로 (T-146)
  const params = new URLSearchParams({ page: String(page) })
  if (size) params.set('size', String(size))
  if (q) params.set('q', q)
  if (order) params.set('order', order)
  if (category) params.set('category', category)
  return getJson<PublicPostList>(tenantSlug, `${postsPath(tenantSlug, board)}?${params.toString()}`)
}

export function fetchPublicPost(
  tenantSlug: string,
  board: string,
  postId: string,
): Promise<PublicPost | null> {
  return getJson<PublicPost>(tenantSlug, `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}`)
}

/** 사이트맵에 넣을 공개 글 (T-140-C) */
export function fetchSitemapPosts(tenantSlug: string): Promise<PublicSitemapPost[] | null> {
  return getJson<PublicSitemapPost[]>(tenantSlug, `/public/site/${encodeURIComponent(tenantSlug)}/sitemap-posts`)
}

/** 칸 값 표시 — 사진은 화면마다 이미지로 그린다 */
export function fieldValueText({ field_type: type, value }: PublicFieldValue): string {
  if (type === 'BOOLEAN') return value ? '예' : '아니오'
  if (type === 'RATING') return `${'★'.repeat(Number(value))}${'☆'.repeat(5 - Number(value))}`
  return Array.isArray(value) ? value.join(', ') : String(value)
}

/** 연락처 · 이메일 · 링크 칸의 주소 — 값은 서버가 검사했다 */
export function fieldValueHref({ field_type: type, value }: PublicFieldValue): string | null {
  const text = String(value)
  if (type === 'PHONE') return `tel:${text.replace(/[^0-9+]/g, '')}`
  if (type === 'EMAIL') return `mailto:${text}`
  if (type === 'URL') return /^https?:\/\//i.test(text) ? text : null
  return null
}

/** 공개일 YYYY-MM-DD (한국 시간) */
export const postDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso))
