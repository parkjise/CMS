import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import type { PublicSection } from '@/lib/publicSite.types'

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
      <header className="border-b border-slate-200 px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900">
          {site.tenant.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">/{site.tenant.slug}</p>
      </header>

      <div className="flex flex-col">
        {activeSections.length === 0 ? (
          <EmptySectionsPlaceholder />
        ) : (
          activeSections.map((section) => (
            <SectionPlaceholder key={section.id} section={section} />
          ))
        )}
      </div>
    </main>
  )
}

function SectionPlaceholder({ section }: { section: PublicSection }) {
  return (
    <section
      data-section-id={section.id}
      data-section-type={section.section_type}
      className="border-b border-dashed border-slate-200 px-6 py-12"
    >
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {section.section_type}
      </p>
      <p className="mt-2 text-lg font-medium text-slate-700">{section.label}</p>
      <p className="mt-1 text-xs text-slate-400">
        섹션 컴포넌트는 T-048에서 구현됩니다
      </p>
    </section>
  )
}

function EmptySectionsPlaceholder() {
  return (
    <section className="px-6 py-24 text-center">
      <p className="text-base text-slate-500">아직 표시할 섹션이 없습니다.</p>
    </section>
  )
}
