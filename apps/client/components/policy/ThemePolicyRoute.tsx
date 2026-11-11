import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { fetchPublicSite } from '@/lib/publicSite'
import { memberEnabled } from '@/lib/publicSite.types'
import { canonicalMeta } from '@/lib/seoMeta'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { fetchSitePolicy } from '@/lib/fetchSitePolicy'
import { POLICY_TITLES, type PolicyKind } from '@/lib/sitePolicy'
import { themeHomeSections } from '@/lib/themeSections'
import { usesCodeTemplate } from '@/templates/manifests'
import { TemplateSwitching } from '@/templates/shared/TemplateSwitching'
import { PolicyArticle } from './PolicyArticle'

/** 약관 · 방침 페이지 — 테마형 (T-200). 코드형은 미들웨어가 템플릿 라우트로 보낸다 */
export async function themePolicyMetadata(slug: string, kind: PolicyKind): Promise<Metadata> {
  const site = await fetchPublicSite(slug)
  if (!site) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }
  return {
    title: `${POLICY_TITLES[kind]} | ${site.tenant.name}`,
    ...canonicalMeta(site, `/${kind}`),
  }
}

export async function renderThemePolicy(slug: string, kind: PolicyKind) {
  const site = await fetchPublicSite(slug)
  if (!site) notFound()
  if (usesCodeTemplate(site)) return <TemplateSwitching />
  const policy = await fetchSitePolicy(slug, kind)
  if (!policy) notFound()
  const noSlug = Boolean((await headers()).get(CUSTOM_HOST_HEADER))

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <Navbar
        tenantName={site.tenant.name}
        logoUrl={site.site_settings?.logo_url}
        menuItems={site.site_settings?.menu_items}
        sections={themeHomeSections(site.sections, site.boards)}
        tenantSlug={memberEnabled(site) ? site.tenant.slug : undefined}
        site={{ slug, boards: site.boards, subPage: true }}
      />
      <main className="flex-1">
        <PolicyArticle policy={policy} />
      </main>
      <Footer
        tenantName={site.tenant.name}
        sns={site.sns_settings}
        info={site.site_settings}
        policyBase={noSlug ? '' : `/${slug}`}
      />
      <FloatingButtons
        tenantSlug={slug}
        kakaoUrl={site.sns_settings?.kakao_url ?? null}
        showKakao={site.sns_settings?.show_floating ?? true}
        kakaoPosition={site.sns_settings?.floating_position ?? 'BOTTOM_RIGHT'}
      />
    </div>
  )
}
