import { describe, expect, it } from 'vitest'
import { resolveOgImage } from '@/lib/socialMeta'
import type { PublicSite, PublicSection } from '@/lib/publicSite.types'

function heroSection(bgImage?: string): PublicSection {
  return {
    id: 'hero',
    section_type: 'HERO_BANNER',
    label: '메인',
    display_order: 0,
    is_active: true,
    settings: bgImage
      ? [{ field_key: 'bg_image_url', field_value: bgImage, value_type: 'url' }]
      : [],
  }
}

function buildSite(partial: Partial<PublicSite> = {}): PublicSite {
  return {
    tenant: {
      id: 't',
      slug: 's',
      name: '가게',
      template_type: 'GENERAL',
      plan_type: 'BASIC',
      custom_domain: null,
    },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template: null,
    ...partial,
  }
}

const seo = (ogImage: string | null) => ({
  meta_title: null,
  meta_description: null,
  og_image_url: ogImage,
  google_analytics_id: null,
  naver_site_verification: null,
})

describe('resolveOgImage (T-075)', () => {
  it('SEO og_image_url을 최우선 사용한다', () => {
    const site = buildSite({
      seo_settings: seo('https://cdn/og.png'),
      sections: [heroSection('https://cdn/hero.jpg')],
    })
    expect(resolveOgImage(site)).toBe('https://cdn/og.png')
  })

  it('SEO 이미지가 없으면 HERO 배너 이미지로 폴백한다', () => {
    const site = buildSite({
      seo_settings: seo(null),
      sections: [heroSection('https://cdn/hero.jpg')],
    })
    expect(resolveOgImage(site)).toBe('https://cdn/hero.jpg')
  })

  it('SEO/HERO 둘 다 없으면 undefined', () => {
    expect(resolveOgImage(buildSite())).toBeUndefined()
    expect(
      resolveOgImage(buildSite({ sections: [heroSection()] })),
    ).toBeUndefined()
  })

  it('비활성 HERO 섹션은 폴백에 사용하지 않는다', () => {
    const inactiveHero: PublicSection = {
      ...heroSection('https://cdn/hero.jpg'),
      is_active: false,
    }
    expect(
      resolveOgImage(buildSite({ sections: [inactiveHero] })),
    ).toBeUndefined()
  })
})
