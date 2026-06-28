import type { PublicSite } from './publicSite.types'
import { getString } from './sectionSettings'

/**
 * OG/트위터 카드 이미지 결정 (T-075).
 * 우선순위: SEO og_image_url → HERO 배너 배경 이미지(bg_image_url) → 없음.
 */
export function resolveOgImage(site: PublicSite): string | undefined {
  const explicit = site.seo_settings?.og_image_url
  if (explicit) return explicit

  const hero = site.sections.find(
    (s) => s.section_type === 'HERO_BANNER' && s.is_active,
  )
  if (!hero) return undefined
  return getString(hero.settings, 'bg_image_url') || undefined
}
