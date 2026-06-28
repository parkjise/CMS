import type { Metadata } from 'next'
import { fetchPublicSite } from '@/lib/publicSite'
import { resolveOgImage } from '@/lib/socialMeta'
import { buildCssVarBody } from '@/lib/theme'
import { AuthInitializer } from '@/components/auth/AuthInitializer'
import { RestoreDraftDialog } from '@/components/layout/RestoreDraftDialog'

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

interface Props {
  children: React.ReactNode
  params: Promise<{ tenant_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug } = await params
  const site = await fetchPublicSite(tenant_slug)

  if (!site) {
    return {
      title: '페이지를 찾을 수 없습니다',
      robots: { index: false, follow: false },
    }
  }

  const seo = site.seo_settings
  const title = seo?.meta_title ?? site.tenant.name
  const description = seo?.meta_description ?? undefined
  // OG 이미지: SEO 설정 → HERO 배너 이미지 자동 폴백
  const ogImage = resolveOgImage(site)
  const images = ogImage ? [{ url: ogImage }] : undefined
  const url = `${getSiteUrl()}/${site.tenant.slug}`

  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: site.tenant.name,
      images,
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images,
    },
    verification: seo?.naver_site_verification
      ? { other: { 'naver-site-verification': seo.naver_site_verification } }
      : undefined,
    other: seo?.google_analytics_id
      ? { 'google-analytics-id': seo.google_analytics_id }
      : undefined,
  }
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenant_slug } = await params
  const site = await fetchPublicSite(tenant_slug)
  const cssVarBody = buildCssVarBody(site?.template?.css_variables)

  return (
    <>
      {cssVarBody && (
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { ${cssVarBody} }`,
          }}
        />
      )}
      <AuthInitializer />
      {children}
      <RestoreDraftDialog />
    </>
  )
}
