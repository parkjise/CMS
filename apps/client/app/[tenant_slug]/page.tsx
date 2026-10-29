import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { buildLocalBusinessJsonLd, serializeJsonLd } from '@/lib/jsonLd'
import { countSampleSettings } from '@/lib/sampleCount'
import { memberEnabled } from '@/lib/publicSite.types'
import { themeHomeSections } from '@/lib/themeSections'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

export default async function TenantHomePage({ params }: Props) {
  const { tenant_slug } = await params
  const site = await fetchPublicSite(tenant_slug)

  if (!site) {
    notFound()
  }

  const jsonLd = buildLocalBusinessJsonLd(site)
  const sampleCount = countSampleSettings(site.sections)

  // 코드형 템플릿 테넌트는 middleware.ts 가 템플릿 전용 라우트(app/(code)/tpl-{key})로 보낸다.
  // 이 라우트는 테마형 전용 — 코드형 템플릿 화면을 import 하지 않아야 다른 템플릿 CSS·JS 가 섞이지 않는다.

  // 홈 페이지의 그릴 수 있는 섹션만 — 코드형 템플릿용 하위 페이지 섹션이 섞이지 않게 (T-057-A)
  const activeSections = themeHomeSections(site.sections)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <EditToolbar sampleCount={sampleCount} />
      <Navbar tenantName={site.tenant.name} logoUrl={site.site_settings?.logo_url} sections={activeSections} tenantSlug={memberEnabled(site) ? site.tenant.slug : undefined} />

      <main className="flex-1">
        {activeSections.length === 0 ? (
          <EmptySectionsPlaceholder />
        ) : (
          activeSections.map((section) => (
            <SectionRenderer key={section.id} section={section} tenantSlug={tenant_slug} />
          ))
        )}
      </main>

      <Footer tenantName={site.tenant.name} sns={site.sns_settings} info={site.site_settings} />

      <FloatingButtons
        tenantSlug={tenant_slug}
        kakaoUrl={site.sns_settings?.kakao_url ?? null}
        showKakao={site.sns_settings?.show_floating ?? true}
        kakaoPosition={site.sns_settings?.floating_position ?? 'BOTTOM_RIGHT'}
      />
    </div>
  )
}

function EmptySectionsPlaceholder() {
  return (
    <section className="px-6 py-24 text-center">
      <p className="text-base text-[color:var(--color-text-muted)]">아직 표시할 섹션이 없습니다.</p>
    </section>
  )
}
