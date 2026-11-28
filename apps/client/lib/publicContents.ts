/**
 * 콘텐츠 연결 섹션의 공개 콘텐츠 (T-258) — /api/public/site/{slug}/content-types/{id}/items
 * 사이트와 같은 캐시 태그라 콘텐츠를 저장하면 바로 비워진다.
 */
import type { PublicContentItem } from '@cms/types'
import { serverApiBase } from './apiBase'
import { getString } from './sectionSettings'
import type { PublicSection } from './publicSite.types'

const REVALIDATE_SECONDS = 60

export type ContentDisplay = 'CARD' | 'LIST' | 'FAQ' | 'TIMELINE' | 'LOGO'
export type ContentSort = 'order' | 'latest' | 'title'

const DISPLAYS: readonly ContentDisplay[] = ['CARD', 'LIST', 'FAQ', 'TIMELINE', 'LOGO']
const SORTS: readonly ContentSort[] = ['order', 'latest', 'title']
export const CONTENT_DEFAULT_COUNT = 6
export const CONTENT_MAX_COUNT = 24

/** 섹션 칸 → 보여 주는 방식 · 조건 (모르는 값은 기본값) */
export function contentOptions(section: PublicSection) {
  const mode = getString(section.settings, 'display_mode') as ContentDisplay
  const sort = getString(section.settings, 'sort') as ContentSort
  const count = Number(getString(section.settings, 'item_count'))
  return {
    typeId: getString(section.settings, 'content_type'),
    mode: DISPLAYS.includes(mode) ? mode : 'CARD',
    sort: SORTS.includes(sort) ? sort : 'order',
    category: getString(section.settings, 'category_id'),
    tag: getString(section.settings, 'tag_id'),
    count:
      Number.isInteger(count) && count > 0 ? Math.min(count, CONTENT_MAX_COUNT) : CONTENT_DEFAULT_COUNT,
    emptyText: getString(section.settings, 'empty_text').trim(),
  }
}

/**
 * 못 보여 주는 이유 (T-261) — 공개 API 404 의 코드.
 * FEATURE_OFF · TYPE_MISSING 은 관리자에게만 안내, ERROR(사업체 없음 · 네트워크)는 그리지 않음.
 */
export type ContentUnavailable = 'FEATURE_OFF' | 'TYPE_MISSING' | 'ERROR'

const UNAVAILABLE_CODES: Record<string, ContentUnavailable> = {
  CONTENT_FEATURE_OFF: 'FEATURE_OFF',
  CONTENT_TYPE_MISSING: 'TYPE_MISSING',
}

/**
 * 공개 콘텐츠 — 못 보여 주면 이유.
 * draft: 저장 전 미리보기 토큰 — 초안도 함께 받고 캐시하지 않는다 (T-261)
 */
export async function fetchContentItems(
  tenantSlug: string,
  typeId: string,
  {
    limit,
    sort,
    category,
    tag,
    body,
    draft,
  }: {
    limit: number
    sort: ContentSort
    category?: string
    tag?: string
    body?: boolean
    draft?: string
  },
): Promise<PublicContentItem[] | ContentUnavailable> {
  const params = new URLSearchParams({ limit: String(limit), sort })
  if (category) params.set('category', category)
  if (tag) params.set('tag', tag)
  if (body) params.set('body', 'true')
  if (draft) params.set('draft', draft)
  const path = `/public/site/${encodeURIComponent(tenantSlug)}/content-types/${encodeURIComponent(typeId)}/items`
  try {
    const res = await fetch(`${serverApiBase()}${path}?${params.toString()}`, {
      ...(draft
        ? { cache: 'no-store' as const }
        : { next: { revalidate: REVALIDATE_SECONDS, tags: [`site:${tenantSlug}`] } }),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { code?: string } } | null
      return UNAVAILABLE_CODES[json?.error?.code ?? ''] ?? 'ERROR'
    }
    const json = (await res.json()) as { data: PublicContentItem[] }
    return json.data
  } catch (error) {
    console.error('[publicContents] request failed', { path, error })
    return 'ERROR'
  }
}
