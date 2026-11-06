/**
 * 회원만 읽는 게시판의 글 (T-150) — 브라우저에서 회원 토큰으로 읽는다.
 * 공개 캐시를 쓰지 않는다. 로그인이 풀렸거나 권한이 없으면 MemberBoardDenied.
 */
import type { PublicPost, PublicPostList } from '@cms/types'
import { browserApiBase } from './apiBase'
import type { PostsFetcher } from './boardRoute'
import { memberAuthHeader } from './memberStore'

export class MemberBoardDenied extends Error {}

const postsPath = (tenantSlug: string, board: string) =>
  `/public/site/${encodeURIComponent(tenantSlug)}/boards/${encodeURIComponent(board)}/posts`

async function getMemberJson<T>(tenantSlug: string, path: string): Promise<T | null> {
  const res = await fetch(`${browserApiBase()}${path}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(await memberAuthHeader(tenantSlug)) },
  })
  if (res.status === 401 || res.status === 403) throw new MemberBoardDenied()
  if (!res.ok) return null
  return ((await res.json()) as { data: T }).data
}

export const fetchMemberPosts: PostsFetcher = (tenantSlug, board, { page, size, q, category }) => {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  return getMemberJson<PublicPostList>(
    tenantSlug,
    `${postsPath(tenantSlug, board)}?${params.toString()}`
  )
}

export const fetchMemberPost = (
  tenantSlug: string,
  board: string,
  postId: string
): Promise<PublicPost | null> =>
  getMemberJson<PublicPost>(
    tenantSlug,
    `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}`
  )
