import type { Metadata } from 'next'
import { fetchPublicSite } from '@/lib/publicSite'
import { buildCssVarBody } from '@/lib/theme'
import { AuthInitializer } from '@/components/auth/AuthInitializer'

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
  const ogImage = seo?.og_image_url ?? undefined

  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
      type: 'website',
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
    </>
  )
}
