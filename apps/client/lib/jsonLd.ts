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
  // 관리자 공통 설정의 주소가 먼저 (T-036-A), 없으면 '오시는 길' 섹션
  const common = site.site_settings
  if (common?.address) {
    return {
      '@type': 'PostalAddress',
      streetAddress: common.address_detail ? `${common.address} ${common.address_detail}` : common.address,
      addressCountry: 'KR',
    }
  }
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
 * SEO 대표 키워드(T-040-A, 배열)를 schema.org `keywords`(쉼표 구분 문자열)로 변환.
 * 비어 있으면 주입하지 않는다.
 */
function buildKeywords(site: PublicSite): string | undefined {
  const raw: unknown = site.seo_settings?.keywords
  if (!raw) return undefined
  const list = Array.isArray(raw) ? raw : String(raw).split(',')
  const cleaned = list
    .map((k) => String(k).trim())
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
  // 대표 전화 · 이메일 (T-036-A). 영업시간은 자유 입력이라 schema.org openingHours
  // 형식(Mo-Fr 09:00-18:00)과 맞지 않아 넣지 않는다 — 잘못된 구조화 데이터는 검색 경고가 된다
  if (site.site_settings?.phone) {
    jsonLd.telephone = site.site_settings.phone
  }
  if (site.site_settings?.email) {
    jsonLd.email = site.site_settings.email
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
