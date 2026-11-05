import type { Metadata } from 'next'
import { fetchPublicSite } from '@/lib/publicSite'
import { robotsFrom } from '@/lib/seoMeta'
import { resolveOgImage } from '@/lib/socialMeta'
import { buildCssVarBody } from '@/lib/theme'
import { AuthInitializer } from '@/components/auth/AuthInitializer'
import MemberInitializer from '@/components/member/MemberInitializer'
import { memberEnabled } from '@/lib/publicSite.types'
import { RestoreDraftDialog } from '@/components/layout/RestoreDraftDialog'

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

export interface Props {
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
  // 소셜 제목 · 설명이 비어 있으면 검색용 값을 쓴다 (T-129)
  const socialTitle = seo?.og_title || title
  const socialDescription = seo?.og_description || description

  return {
    title,
    description,
    robots: robotsFrom(seo),
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url,
      siteName: site.tenant.name,
      images,
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: socialTitle,
      description: socialDescription,
      images,
    },
    verification:
      seo?.google_site_verification || seo?.naver_site_verification
        ? {
            google: seo?.google_site_verification ?? undefined,
            other: seo?.naver_site_verification
              ? { 'naver-site-verification': seo.naver_site_verification }
              : undefined,
          }
        : undefined,
    other: seo?.google_analytics_id
      ? { 'google-analytics-id': seo.google_analytics_id }
      : undefined,
    // 브라우저 탭 아이콘 — 관리자 공통 설정 (T-036-A)
    icons: site.site_settings?.favicon_url
      ? { icon: site.site_settings.favicon_url }
      : undefined,
  }
}

/**
 * 테넌트 공통 레이아웃 (메타 · 색상 변수 · 로그인 상태) — 테마형 라우트(layout.tsx)와
 * 코드형 템플릿 라우트(/tpl-*)가 함께 쓴다. 글꼴은 각 라우트가 따로 (T-125)
 */
export default async function TenantShell({ children, params }: Props) {
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
      <AuthInitializer tenantId={site?.tenant.id ?? null} />
      {memberEnabled(site) && <MemberInitializer slug={tenant_slug} />}
      {children}
      <RestoreDraftDialog />
    </>
  )
}
