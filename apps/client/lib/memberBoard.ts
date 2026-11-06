/**
 * 회원 게시판 API (T-150) — 브라우저에서 회원 토큰으로 부른다.
 * - 회원만 읽는 게시판의 글 (T-150-A) · 회원 글쓰기 · 자기 글 (T-150-B)
 * 공개 캐시를 쓰지 않는다. 로그인이 풀렸거나 권한이 없으면 MemberBoardDenied.
 */
import type { MemberPost, PublicPost, PublicPostList } from '@cms/types'
import { browserApiBase } from './apiBase'
import type { PostsFetcher } from './boardRoute'
import { memberAuthHeader } from './memberStore'

export class MemberBoardDenied extends Error {}

/** 서버가 거절한 저장 — 화면에 그대로 보여 줄 메시지 (글자 수 · 분류 · 1시간 한도 등) */
export class MemberPostError extends Error {}

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

/** 내가 쓴 글 — 아니면 null (남의 글 · 지운 글) */
export async function fetchMyPost(
  tenantSlug: string,
  board: string,
  postId: string
): Promise<MemberPost | null> {
  return getMemberJson<MemberPost>(
    tenantSlug,
    `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}/mine`
  )
}

export interface MemberPostInput {
  title: string
  content: string
  category_id: string | null
}

async function send<T>(
  tenantSlug: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${browserApiBase()}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(await memberAuthHeader(tenantSlug)),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json().catch(() => null)) as {
    data?: T
    error?: { message?: string }
  } | null
  if (res.status === 401) throw new MemberBoardDenied()
  if (!res.ok)
    throw new MemberPostError(
      json?.error?.message ?? '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
    )
  return json?.data as T
}

export const createMemberPost = (tenantSlug: string, board: string, input: MemberPostInput) =>
  send<MemberPost>(tenantSlug, 'POST', postsPath(tenantSlug, board), input)

export const updateMemberPost = (
  tenantSlug: string,
  board: string,
  postId: string,
  input: MemberPostInput
) =>
  send<MemberPost>(
    tenantSlug,
    'PATCH',
    `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}`,
    input
  )

export const deleteMemberPost = (tenantSlug: string, board: string, postId: string) =>
  send<{ deleted: boolean }>(
    tenantSlug,
    'DELETE',
    `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}`
  )
