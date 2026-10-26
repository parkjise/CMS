import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { buildLocalBusinessJsonLd, serializeJsonLd } from '@/lib/jsonLd'
import { countSampleSettings } from '@/lib/sampleCount'

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

  const activeSections = site.sections.filter((s) => s.is_active)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <EditToolbar sampleCount={sampleCount} />
      <Navbar tenantName={site.tenant.name} sections={activeSections} tenantSlug={site.tenant.slug} />

      <main className="flex-1">
        {activeSections.length === 0 ? (
          <EmptySectionsPlaceholder />
        ) : (
          activeSections.map((section) => (
            <SectionRenderer key={section.id} section={section} tenantSlug={tenant_slug} />
          ))
        )}
      </main>

      <Footer tenantName={site.tenant.name} sns={site.sns_settings} />

      <FloatingButtons tenantSlug={tenant_slug} kakaoUrl={site.sns_settings?.kakao_url ?? null} />
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
