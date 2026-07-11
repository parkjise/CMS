import type { PublicSite } from './publicSite.types'
import { getString } from './sectionSettings'

// 업종(template_type) → schema.org 타입 매핑 (T-074)
const TEMPLATE_TO_SCHEMA: Record<string, string> = {
  HOSPITAL: 'MedicalBusiness',
  PENSION: 'LodgingBusiness',
  RESTAURANT: 'Restaurant',
  STARTUP: 'Organization',
  GENERAL: 'LocalBusiness',
}

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

function buildSameAs(site: PublicSite): string[] {
  const sns = site.sns_settings
  if (!sns) return []
  return [
    sns.kakao_url,
    sns.instagram_url,
    sns.facebook_url,
    sns.youtube_url,
    sns.blog_url,
    sns.naver_url,
  ].filter((u): u is string => Boolean(u))
}

function getMapSection(site: PublicSite) {
  return site.sections.find((s) => s.section_type === 'MAP' && s.is_active)
}

function buildAddress(site: PublicSite): Record<string, string> | undefined {
  const mapSection = getMapSection(site)
  if (!mapSection) return undefined
  const street = getString(mapSection.settings, 'address')
  if (!street) return undefined
  const detail = getString(mapSection.settings, 'address_detail')
  return {
    '@type': 'PostalAddress',
    streetAddress: detail ? `${street} ${detail}` : street,
    addressCountry: 'KR',
  }
}

function buildGeo(site: PublicSite): Record<string, unknown> | undefined {
  const mapSection = getMapSection(site)
  if (!mapSection) return undefined
  const lat = Number(getString(mapSection.settings, 'latitude'))
  const lng = Number(getString(mapSection.settings, 'longitude'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return undefined
  }
  return {
    '@type': 'GeoCoordinates',
    latitude: lat,
    longitude: lng,
  }
}

/**
 * SEO 설정의 키워드를 schema.org `keywords`(쉼표 구분 문자열)로 변환.
 * 현재 SEO 모델에는 keywords 필드가 없어 값이 있을 때만 주입된다(향후 확장 대비).
 */
function buildKeywords(site: PublicSite): string | undefined {
  const raw = (site.seo_settings as { keywords?: string | null } | null)?.keywords
  if (!raw) return undefined
  const cleaned = raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  return cleaned.length > 0 ? cleaned.join(', ') : undefined
}

/**
 * JSON-LD 객체를 `<script type="application/ld+json">`에 안전하게 주입하기 위한
 * 직렬화. 테넌트가 편집 가능한 값(상호명·메타 설명·주소 등)이 포함되므로
 * `</script>` 탈출 및 XSS를 막기 위해 `<`, `>`, `&`와 줄 구분자를 이스케이프한다.
 * (JSON 문자열 값 내부에서만 치환되므로 JSON 유효성은 유지된다.)
 */
export function serializeJsonLd(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function buildLocalBusinessJsonLd(site: PublicSite): Record<string, unknown> {
  const schemaType = TEMPLATE_TO_SCHEMA[site.tenant.template_type] ?? 'LocalBusiness'
  const url = `${getSiteUrl()}/${site.tenant.slug}`
  const sameAs = buildSameAs(site)
  const address = buildAddress(site)
  const geo = buildGeo(site)
  const keywords = buildKeywords(site)

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: site.tenant.name,
    url,
  }

  if (site.seo_settings?.meta_description) {
    jsonLd.description = site.seo_settings.meta_description
  }
  if (site.seo_settings?.og_image_url) {
    jsonLd.image = site.seo_settings.og_image_url
  }
  if (address) {
    jsonLd.address = address
  }
  if (geo) {
    jsonLd.geo = geo
  }
  if (keywords) {
    jsonLd.keywords = keywords
  }
  if (sameAs.length > 0) {
    jsonLd.sameAs = sameAs
  }

  return jsonLd
}
