/**
 * 비회원 글쓰기 · 글 비밀번호 · 신고 API (T-151-B) — 브라우저에서 부른다.
 * 글 비밀번호는 요청에만 담고 어디에도 저장하지 않는다.
 */
import type { GuestPost, ReportReason } from '@cms/types'
import { browserApiBase } from './apiBase'
import { MemberPostError } from './memberBoard'
import { memberAuthHeader } from './memberStore'

const postsPath = (tenantSlug: string, board: string) =>
  `/public/site/${encodeURIComponent(tenantSlug)}/boards/${encodeURIComponent(board)}/posts`

/** 비밀번호가 틀렸다 (403) — 화면이 비밀번호 칸에 표시한다 */
export class GuestPasswordError extends Error {}

async function send<T>(path: string, body: unknown, method = 'POST', headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${browserApiBase()}${path}`, {
    method,
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null
  const message = json?.error?.message
  if (res.status === 403 && message?.includes('비밀번호')) throw new GuestPasswordError(message)
  if (!res.ok) throw new MemberPostError(message ?? '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
  return json?.data as T
}

export interface GuestPostInput {
  name: string
  password: string
  title: string
  content: string
  category_id: string | null
  is_secret?: boolean
  agree: true
  recaptcha_token: string | null
}

export const createGuestPost = (tenantSlug: string, board: string, input: GuestPostInput) =>
  send<GuestPost>(`${postsPath(tenantSlug, board)}/guest`, input)

export const verifyGuestPost = (tenantSlug: string, board: string, postId: string, password: string) =>
  send<GuestPost>(`${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}/guest/verify`, { password })

export interface GuestPostUpdateInput {
  password: string
  title: string
  content: string
  category_id: string | null
  is_secret?: boolean
}

export const updateGuestPost = (tenantSlug: string, board: string, postId: string, input: GuestPostUpdateInput) =>
  send<GuestPost>(`${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}/guest`, input, 'PATCH')

export const deleteGuestPost = (tenantSlug: string, board: string, postId: string, password: string) =>
  send<{ deleted: boolean }>(`${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}/guest/delete`, {
    password,
  })

/** 신고 — 로그인한 회원이면 회원으로, 아니면 방문자로 (같은 사람은 한 글에 한 번) */
export const reportPost = async (
  tenantSlug: string,
  board: string,
  postId: string,
  reason: ReportReason,
  detail: string,
) =>
  send<{ reported: boolean; hidden: boolean }>(
    `${postsPath(tenantSlug, board)}/${encodeURIComponent(postId)}/report`,
    { reason, detail },
    'POST',
    await memberAuthHeader(tenantSlug),
  )

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: '스팸 · 광고' },
  { value: 'ABUSE', label: '욕설 · 비방' },
  { value: 'PRIVACY', label: '개인정보 노출' },
  { value: 'OTHER', label: '기타' },
]
