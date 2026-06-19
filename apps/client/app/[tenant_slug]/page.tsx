import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import { SectionRenderer } from '@/components/sections/SectionRenderer'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

export default async function TenantHomePage({ params }: Props) {
  const { tenant_slug } = await params
  const site = await fetchPublicSite(tenant_slug)

  if (!site) {
    notFound()
  }

  const activeSections = site.sections.filter((s) => s.is_active)

  return (
    <main className="min-h-screen bg-white">
      {activeSections.length === 0 ? (
        <EmptySectionsPlaceholder />
      ) : (
        activeSections.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            tenantSlug={tenant_slug}
          />
        ))
      )}
    </main>
  )
}

function EmptySectionsPlaceholder() {
  return (
    <section className="px-6 py-24 text-center">
      <p className="text-base text-slate-500">아직 표시할 섹션이 없습니다.</p>
    </section>
  )
}
