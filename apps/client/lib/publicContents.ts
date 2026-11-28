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

/** 공개 콘텐츠 — 스위치가 꺼졌거나 유형이 없으면 null */
export async function fetchContentItems(
  tenantSlug: string,
  typeId: string,
  {
    limit,
    sort,
    category,
    tag,
    body,
  }: { limit: number; sort: ContentSort; category?: string; tag?: string; body?: boolean },
): Promise<PublicContentItem[] | null> {
  const params = new URLSearchParams({ limit: String(limit), sort })
  if (category) params.set('category', category)
  if (tag) params.set('tag', tag)
  if (body) params.set('body', 'true')
  const path = `/public/site/${encodeURIComponent(tenantSlug)}/content-types/${encodeURIComponent(typeId)}/items`
  try {
    const res = await fetch(`${serverApiBase()}${path}?${params.toString()}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [`site:${tenantSlug}`] },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: PublicContentItem[] }
    return json.data
  } catch (error) {
    console.error('[publicContents] request failed', { path, error })
    return null
  }
}
