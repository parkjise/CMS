import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { buildLocalBusinessJsonLd, serializeJsonLd } from '@/lib/jsonLd'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import { resolveCodeTemplate } from '@/templates/registry'

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

  // 코드형 템플릿 (기획서 11.7) — 템플릿 전용 마크업·스타일로 렌더링
  const codeTemplate = resolveCodeTemplate(site)
  if (codeTemplate) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
        <EditToolbar />
        <CodeTemplateRenderer
          entry={codeTemplate}
          site={site}
          tenantSlug={tenant_slug}
          pageKey="home"
        />
      </>
    )
  }

  const activeSections = site.sections.filter((s) => s.is_active)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <EditToolbar />
      <Navbar tenantName={site.tenant.name} sections={activeSections} />

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
