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

/**
 * 템플릿 미리보기 데이터 조회 (T-057).
 * 실제 콘텐츠(섹션)에 지정 템플릿(`templateId`) CSS를 적용한 응답을 받는다.
 * 미리보기는 항상 최신 상태를 보여주기 위해 캐시하지 않는다.
 */
export async function fetchTemplatePreview(
  tenantSlug: string,
  templateId: string,
): Promise<PublicSite | null> {
  const url =
    `${BASE_URL}/public/preview/${encodeURIComponent(tenantSlug)}` +
    `?tpl=${encodeURIComponent(templateId)}`

  let res: Response
  try {
    res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    console.error('[fetchTemplatePreview] network error', {
      tenantSlug,
      templateId,
      error,
    })
    return null
  }

  if (res.status === 404) return null
  if (!res.ok) {
    console.error('[fetchTemplatePreview] non-OK response', {
      tenantSlug,
      templateId,
      status: res.status,
    })
    return null
  }

  const body = (await res.json()) as ApiSuccess<PublicSite>
  return body.data
}
