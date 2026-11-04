import type { Metadata } from 'next'
import type { PublicSeoSettings, PublicSite } from './publicSite.types'

/** 검색 노출 설정 (T-129) — 'noindex,follow' 등. 값이 없으면 전체 허용 */
export function robotsFrom(seo: PublicSeoSettings | null | undefined): {
  index: boolean
  follow: boolean
} {
  const parts = (seo?.robots ?? 'index,follow').split(',')
  return { index: !parts.includes('noindex'), follow: !parts.includes('nofollow') }
}

/**
 * 페이지별 대표 주소 (T-129). 공통 레이아웃에 넣으면 서브 페이지까지 메인을 가리켜
 * 검색에서 빠지므로, 각 페이지 메타에서 경로를 붙여 쓴다.
 */
export function canonicalMeta(site: PublicSite, path = ''): Pick<Metadata, 'alternates'> {
  const base = site.seo_settings?.canonical_url?.replace(/\/+$/, '')
  return base ? { alternates: { canonical: `${base}${path}` } } : {}
}
