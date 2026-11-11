import { serverApiBase } from './apiBase'
import type { PolicyKind, SitePolicy } from './sitePolicy'

/** 서버에서 약관 · 방침을 읽는다 (T-200) — 사이트 캐시와 같이 비워진다 */
export async function fetchSitePolicy(slug: string, kind: PolicyKind): Promise<SitePolicy | null> {
  try {
    const res = await fetch(
      `${serverApiBase()}/public/site/${encodeURIComponent(slug)}/policies/${kind}`,
      { next: { revalidate: 60, tags: [`site:${slug}`] }, headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return null
    const body = (await res.json()) as { data?: SitePolicy }
    return body.data ?? null
  } catch {
    return null
  }
}
