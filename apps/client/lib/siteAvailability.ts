import { serverApiBase } from './apiBase'

/**
 * 홈페이지를 지금 보여 줄 수 있는지 (T-201, 기획서 10.2 #11) — 구독이 끝나 닫힌 사이트는 PAUSED.
 * 없는 주소 · 삭제된 사업체는 null (그냥 404).
 */
export interface SiteAvailability {
  status: 'ACTIVE' | 'PAUSED'
  name: string
  phone: string | null
}

/** 닫힌 사이트 안내 화면 — 미들웨어가 모든 주소를 여기로 보낸다 */
export const PAUSED_PAGE = 'paused'

export async function fetchSiteAvailability(
  slug: string,
  init: { timeoutMs?: number } = {}
): Promise<SiteAvailability | null> {
  try {
    const res = await fetch(
      `${serverApiBase()}/public/site/${encodeURIComponent(slug)}/availability`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        ...(init.timeoutMs ? { signal: AbortSignal.timeout(init.timeoutMs) } : {}),
      }
    )
    if (!res.ok) return null
    const body = (await res.json()) as { data?: SiteAvailability }
    return body.data ?? null
  } catch {
    return null
  }
}
