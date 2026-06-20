import type { PublicSite } from './publicSite.types'
import { getString } from './sectionSettings'

const TEMPLATE_TO_SCHEMA: Record<string, string> = {
  HOSPITAL: 'MedicalBusiness',
  PENSION: 'LodgingBusiness',
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

function buildAddress(site: PublicSite): Record<string, string> | undefined {
  const mapSection = site.sections.find(
    (s) => s.section_type === 'MAP' && s.is_active,
  )
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

export function buildLocalBusinessJsonLd(
  site: PublicSite,
): Record<string, unknown> {
  const schemaType =
    TEMPLATE_TO_SCHEMA[site.tenant.template_type] ?? 'LocalBusiness'
  const url = `${getSiteUrl()}/${site.tenant.slug}`
  const sameAs = buildSameAs(site)
  const address = buildAddress(site)

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
  if (sameAs.length > 0) {
    jsonLd.sameAs = sameAs
  }

  return jsonLd
}
