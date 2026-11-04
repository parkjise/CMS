import { describe, expect, it } from 'vitest'
import { canonicalMeta, robotsFrom } from '@/lib/seoMeta'
import type { PublicSeoSettings, PublicSite } from '@/lib/publicSite.types'

// 검색 노출 · 대표 주소 (T-129)
const site = (canonical_url: string | null, custom_domain: string | null = null) =>
  ({
    tenant: { custom_domain },
    seo_settings: { canonical_url } as PublicSeoSettings,
  }) as PublicSite

describe('robotsFrom', () => {
  it('설정이 없으면 전체 허용', () => {
    expect(robotsFrom(null)).toEqual({ index: true, follow: true })
  })

  it.each([
    ['index,follow', true, true],
    ['noindex,follow', false, true],
    ['index,nofollow', true, false],
    ['noindex,nofollow', false, false],
  ])('%s', (robots, index, follow) => {
    expect(robotsFrom({ robots } as PublicSeoSettings)).toEqual({ index, follow })
  })
})

describe('canonicalMeta', () => {
  it('없으면 넣지 않는다', () => {
    expect(canonicalMeta(site(null))).toEqual({})
  })

  it('연결한 도메인이 있으면 그 주소, 직접 정한 값이 먼저 (T-137)', () => {
    expect(canonicalMeta(site(null, 'www.oo.com'), '/about')).toEqual({
      alternates: { canonical: 'https://www.oo.com/about' },
    })
    expect(canonicalMeta(site('https://a.com', 'www.oo.com'))).toEqual({
      alternates: { canonical: 'https://a.com' },
    })
  })

  it('메인은 대표 주소, 서브 페이지는 경로를 붙인다', () => {
    expect(canonicalMeta(site('https://a.com/'))).toEqual({
      alternates: { canonical: 'https://a.com' },
    })
    expect(canonicalMeta(site('https://a.com'), '/about')).toEqual({
      alternates: { canonical: 'https://a.com/about' },
    })
  })
})
