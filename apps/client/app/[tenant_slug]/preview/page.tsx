import { notFound } from 'next/navigation'
import { fetchTemplatePreview } from '@/lib/publicSite'
import { buildCssVarBody } from '@/lib/theme'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PreviewBanner } from '@/components/preview/PreviewBanner'

interface Props {
  params: Promise<{ tenant_slug: string }>
  searchParams: Promise<{ tpl?: string }>
}

// 미리보기는 검색엔진 색인 대상이 아니다.
export const metadata = {
  title: '템플릿 미리보기',
  robots: { index: false, follow: false },
}

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: Props) {
  const { tenant_slug } = await params
  const { tpl } = await searchParams

  if (!tpl) {
    notFound()
  }

  const site = await fetchTemplatePreview(tenant_slug, tpl)
  if (!site) {
    notFound()
  }

  const activeSections = site.sections.filter((s) => s.is_active)
  // 미리보기 템플릿 CSS를 부모 레이아웃의 현재 템플릿 위에 덮어쓴다(소스 순서상 후순위 우선).
  const cssVarBody = buildCssVarBody(site.template?.css_variables)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      {cssVarBody && (
        <style
          dangerouslySetInnerHTML={{ __html: `:root { ${cssVarBody} }` }}
        />
      )}

      <PreviewBanner templateName={site.template?.name} />

      {/* 편집 UI(EditToolbar·FloatingButtons) 없이 순수 미리보기만 렌더링 */}
      <Navbar tenantName={site.tenant.name} sections={activeSections} />

      <main className="flex-1">
        {activeSections.length === 0 ? (
          <section className="px-6 py-24 text-center">
            <p className="text-base text-[color:var(--color-text-muted)]">
              아직 표시할 섹션이 없습니다.
            </p>
          </section>
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

      <Footer tenantName={site.tenant.name} sns={site.sns_settings} />
    </div>
  )
}
