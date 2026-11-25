import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { fetchPublicSite } from '@/lib/publicSite'
import { customPages, memberEnabled, type PublicSite } from '@/lib/publicSite.types'
import { countSampleSettings } from '@/lib/sampleCount'
import { canonicalMeta, pageSeoMeta } from '@/lib/seoMeta'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { themeHomeSections, themePageSections } from '@/lib/themeSections'
import { usesCodeTemplate } from '@/templates/manifests'
import { TemplateSwitching } from '@/templates/shared/TemplateSwitching'

interface Props {
  params: Promise<{ tenant_slug: string; page_key: string }>
}

/**
 * 테마형 서브 페이지 (T-240, 페이지 관리 기획서) — 직접 만든 공개 페이지만.
 * 게시판 · 공지 · 약관 · 회원 · 미리보기 주소는 앞선 정적 라우트가 먼저 받는다.
 * 코드형은 미들웨어가 템플릿 라우트로 보낸다.
 */
const customPageOf = (site: PublicSite, key: string) =>
  customPages(site).find((p) => p.page_key === key)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug, page_key } = await params
  const site = await fetchPublicSite(tenant_slug)
  if (!site) return {}
  // 전환 안내 화면은 검색엔진 색인 제외 (T-037-F)
  if (usesCodeTemplate(site)) return { robots: { index: false, follow: false } }
  const page = customPageOf(site, page_key)
  if (!page) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }
  return {
    ...pageSeoMeta(page, `${page.title} | ${site.tenant.name}`),
    ...canonicalMeta(site, `/${page_key}`),
  }
}

export default async function ThemeCustomPage({ params }: Props) {
  const { tenant_slug, page_key } = await params
  const site = await fetchPublicSite(tenant_slug)
  if (!site) notFound()
  const page = customPageOf(site, page_key)
  // 없는 주소는 404 — 템플릿 전환 안내는 직접 만든 페이지일 때만
  if (!page) notFound()
  if (usesCodeTemplate(site)) return <TemplateSwitching />
  const noSlug = Boolean((await headers()).get(CUSTOM_HOST_HEADER))

  const sections = themePageSections(site.sections, page_key)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <EditToolbar sampleCount={countSampleSettings(sections)} />
      <Navbar
        tenantName={site.tenant.name}
        logoUrl={site.site_settings?.logo_url}
        menuItems={site.site_settings?.menu_items}
        menuTree={site.site_settings?.menu_tree}
        sections={themeHomeSections(site.sections, site.boards)}
        tenantSlug={memberEnabled(site) ? site.tenant.slug : undefined}
        site={{ slug: tenant_slug, boards: site.boards, subPage: true, pages: customPages(site) }}
      />
      <main className="flex-1">
        <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-14 text-center md:py-20">
          <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-4xl">
            {page.title}
          </h1>
        </header>
        {sections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            tenantSlug={tenant_slug}
            boards={site.boards}
          />
        ))}
      </main>
      <Footer
        tenantName={site.tenant.name}
        sns={site.sns_settings}
        info={site.site_settings}
        policyBase={noSlug ? '' : `/${tenant_slug}`}
      />
      <FloatingButtons
        tenantSlug={tenant_slug}
        kakaoUrl={site.sns_settings?.kakao_url ?? null}
        showKakao={site.sns_settings?.show_floating ?? true}
        kakaoPosition={site.sns_settings?.floating_position ?? 'BOTTOM_RIGHT'}
      />
    </div>
  )
}
