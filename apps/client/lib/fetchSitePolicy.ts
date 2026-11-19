import { serverApiBase } from './apiBase'
import type { PolicyKind, SitePolicy } from './sitePolicy'

async function getJson<T>(slug: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(
      `${serverApiBase()}/public/site/${encodeURIComponent(slug)}/policies/${path}`,
      {
        next: { revalidate: 60, tags: [`site:${slug}`] },
        headers: { Accept: 'application/json' },
      }
    )
    if (!res.ok) return null
    const body = (await res.json()) as { data?: T }
    return body.data ?? null
  } catch {
    return null
  }
}

interface PolicyVersionResponse {
  kind: PolicyKind
  title: string
  body: string
  version: number
  status: string
  effective_at: string | null
}

/**
 * 서버에서 약관 · 방침을 읽는다 (T-200) — 사이트 캐시와 같이 비워진다.
 * version 이 있으면 그 버전(공개 · 보관본만, T-224) — 없는 버전이면 null.
 */
export async function fetchSitePolicy(
  slug: string,
  kind: PolicyKind,
  version: number | null = null
): Promise<SitePolicy | null> {
  const current = await getJson<SitePolicy>(slug, kind)
  if (!current || version === null || version === current.version) return current
  const old = await getJson<PolicyVersionResponse>(slug, `${kind}/versions/${version}`)
  if (!old) return null
  return {
    kind,
    title: old.title,
    body: old.body,
    is_default: false,
    updated_at: old.effective_at,
    version: old.version,
    effective_at: old.effective_at,
    history: current.history,
    archived: old.status === 'archived',
  }
}
