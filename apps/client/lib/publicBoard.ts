/**
 * 온라인 상담 게시판 공개 API (T-123) — /api/public/inquiries/board
 * 서버 컴포넌트에서 목록·상세를 읽는다 (항상 최신: no-store).
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

export interface BoardListItem {
  id: string
  no: number
  subject: string
  author: string
  is_secret: boolean
  answered: boolean
  created_at: string
}

export interface BoardList {
  total: number
  page: number
  size: number
  items: BoardListItem[]
}

export interface BoardPost {
  id: string
  subject: string
  author: string
  is_secret: boolean
  answered: boolean
  created_at: string
  locked: boolean
  message: string | null
  answer: string | null
  answered_at: string | null
  prev_id: string | null
  next_id: string | null
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data: T }
    return body.data
  } catch (error) {
    console.error('[publicBoard] request failed', { path, error })
    return null
  }
}

export function fetchBoardList(
  tenantSlug: string,
  { page = 1, size = 10, q }: { page?: number; size?: number; q?: string },
): Promise<BoardList | null> {
  const params = new URLSearchParams({ tenant_slug: tenantSlug, page: String(page), size: String(size) })
  if (q) params.set('q', q)
  return getJson<BoardList>(`/public/inquiries/board?${params.toString()}`)
}

export function fetchBoardPost(tenantSlug: string, postId: string): Promise<BoardPost | null> {
  const params = new URLSearchParams({ tenant_slug: tenantSlug })
  return getJson<BoardPost>(`/public/inquiries/board/${encodeURIComponent(postId)}?${params.toString()}`)
}
