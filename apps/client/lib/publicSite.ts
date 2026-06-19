import type { PublicSite } from './publicSite.types'

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

const REVALIDATE_SECONDS = 60

interface ApiSuccess<T> {
  success: true
  data: T
  meta: { timestamp: string; version: string }
}

export async function fetchPublicSite(
  tenantSlug: string,
): Promise<PublicSite | null> {
  const url = `${BASE_URL}/public/site/${encodeURIComponent(tenantSlug)}`

  let res: Response
  try {
    res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [`site:${tenantSlug}`] },
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    console.error('[fetchPublicSite] network error', { tenantSlug, error })
    return null
  }

  if (res.status === 404) return null
  if (!res.ok) {
    console.error('[fetchPublicSite] non-OK response', {
      tenantSlug,
      status: res.status,
    })
    return null
  }

  const body = (await res.json()) as ApiSuccess<PublicSite>
  return body.data
}
