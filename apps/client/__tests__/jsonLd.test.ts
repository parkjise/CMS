import { describe, expect, it } from 'vitest'
import { buildLocalBusinessJsonLd } from '@/lib/jsonLd'
import type { PublicSite, PublicSection } from '@/lib/publicSite.types'

function mapSection(
  overrides: Record<string, string> = {},
): PublicSection {
  const settings = Object.entries({
    address: '서울시 강남구 테헤란로 1',
    address_detail: '5층',
    latitude: '37.5012',
    longitude: '127.0396',
    ...overrides,
  }).map(([field_key, field_value]) => ({
    field_key,
    field_value,
    value_type: 'text',
  }))
  return {
    id: 'sec-map',
    section_type: 'MAP',
    label: '오시는 길',
    display_order: 0,
    is_active: true,
    settings,
  }
}

function buildSite(partial: Partial<PublicSite> = {}): PublicSite {
  return {
    tenant: {
      id: 't-1',
      slug: 'my-clinic',
      name: 'OO의원',
      template_type: 'HOSPITAL',
      plan_type: 'STANDARD',
      custom_domain: null,
    },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template: null,
    ...partial,
  }
}

describe('buildLocalBusinessJsonLd (T-074)', () => {
  it('업종별 schema.org 타입을 매핑한다', () => {
    const types: Array<[string, string]> = [
      ['HOSPITAL', 'MedicalBusiness'],
      ['PENSION', 'LodgingBusiness'],
      ['RESTAURANT', 'Restaurant'],
      ['STARTUP', 'Organization'],
      ['GENERAL', 'LocalBusiness'],
    ]
    for (const [industry, schema] of types) {
      const site = buildSite({
        tenant: {
          id: 't',
          slug: 's',
          name: 'n',
          template_type: industry,
          plan_type: 'BASIC',
          custom_domain: null,
        },
      })
      expect(buildLocalBusinessJsonLd(site)['@type']).toBe(schema)
    }
  })

  it('알 수 없는 업종은 LocalBusiness로 폴백한다', () => {
    const site = buildSite({
      tenant: {
        id: 't',
        slug: 's',
        name: 'n',
        template_type: 'UNKNOWN',
        plan_type: 'BASIC',
        custom_domain: null,
      },
    })
    expect(buildLocalBusinessJsonLd(site)['@type']).toBe('LocalBusiness')
  })

  it('기본 필드(@context, name, url)를 포함한다', () => {
    const ld = buildLocalBusinessJsonLd(buildSite())
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld.name).toBe('OO의원')
    expect(ld.url).toContain('/my-clinic')
  })

  it('MAP 섹션에서 주소와 geo 좌표를 주입한다', () => {
    const ld = buildLocalBusinessJsonLd(buildSite({ sections: [mapSection()] }))
    expect(ld.address).toMatchObject({
      '@type': 'PostalAddress',
      streetAddress: '서울시 강남구 테헤란로 1 5층',
      addressCountry: 'KR',
    })
    expect(ld.geo).toMatchObject({
      '@type': 'GeoCoordinates',
      latitude: 37.5012,
      longitude: 127.0396,
    })
  })

  it('0,0 좌표는 geo로 주입하지 않는다', () => {
    const ld = buildLocalBusinessJsonLd(
      buildSite({
        sections: [mapSection({ latitude: '0', longitude: '0' })],
      }),
    )
    expect(ld.geo).toBeUndefined()
  })

  it('MAP 섹션이 없으면 address/geo를 생략한다', () => {
    const ld = buildLocalBusinessJsonLd(buildSite())
    expect(ld.address).toBeUndefined()
    expect(ld.geo).toBeUndefined()
  })

  it('SEO 설명/이미지와 SNS sameAs를 주입한다', () => {
    const site = buildSite({
      seo_settings: {
        meta_title: '제목',
        meta_description: '강남 통증의학과',
        og_image_url: 'https://cdn/og.png',
        google_analytics_id: null,
        naver_site_verification: null,
      },
      sns_settings: {
        kakao_url: 'https://pf.kakao.com/x',
        instagram_url: null,
        facebook_url: null,
        youtube_url: null,
        blog_url: null,
        naver_url: null,
      },
    })
    const ld = buildLocalBusinessJsonLd(site)
    expect(ld.description).toBe('강남 통증의학과')
    expect(ld.image).toBe('https://cdn/og.png')
    expect(ld.sameAs).toEqual(['https://pf.kakao.com/x'])
  })

  it('SEO에 keywords가 있으면 쉼표 구분 문자열로 주입한다(향후 확장)', () => {
    const site = buildSite({
      seo_settings: {
        meta_title: null,
        meta_description: null,
        og_image_url: null,
        google_analytics_id: null,
        naver_site_verification: null,
        // 현재 타입엔 없지만 백엔드가 향후 내려줄 경우를 대비
        keywords: '강남, 통증의학과, 도수치료',
      } as never,
    })
    expect(buildLocalBusinessJsonLd(site).keywords).toBe(
      '강남, 통증의학과, 도수치료',
    )
  })
})
