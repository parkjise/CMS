import { notFound } from 'next/navigation'
import { fetchPublicSite, fetchTemplatePreview } from '@/lib/publicSite'
import { buildCssVarBody } from '@/lib/theme'
import { hiddenInThemeCount, themeHomeSections } from '@/lib/themeSections'
import { SectionRenderer } from '@/components/sections/SectionRenderer'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PreviewBanner } from '@/components/preview/PreviewBanner'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import { findCodeTemplate } from '@/templates/registry'

interface Props {
  params: Promise<{ tenant_slug: string }>
  searchParams: Promise<{ tpl?: string; content?: string; page?: string; id?: string; q?: string; p?: string }>
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
  const { tpl, content, page, id, q, p } = await searchParams

  if (!tpl) {
    notFound()
  }

  // 코드형 템플릿 미리보기: 기본은 템플릿 샘플 그대로(디자인 원본),
  // &content=mine 이면 테넌트 실제 콘텐츠 + 빈 항목만 샘플
  const codeTemplate = findCodeTemplate(tpl)
  if (codeTemplate) {
    const tenantSite = await fetchPublicSite(tenant_slug)
    if (!tenantSite) {
      notFound()
    }
    const pageKey = page ?? 'home'
    if (!codeTemplate.manifest.pages.some((p) => p.key === pageKey)) {
      notFound()
    }
    const previewQuery = `tpl=${encodeURIComponent(tpl)}${content === 'mine' ? '&content=mine' : ''}`
    return (
      <>
        <PreviewBanner templateName={codeTemplate.manifest.name} />
        <CodeTemplateRenderer
          entry={codeTemplate}
          site={tenantSite}
          tenantSlug={tenant_slug}
          pageKey={pageKey}
          preview
          contentSource={content === 'mine' ? 'tenant' : 'sample'}
          previewQuery={previewQuery}
          detailId={id}
          query={{ q, p }}
        />
      </>
    )
  }

  const site = await fetchTemplatePreview(tenant_slug, tpl)
  if (!site) {
    notFound()
  }

  // 홈 페이지의 그릴 수 있는 섹션만 — 메뉴가 넘치거나 하위 페이지 섹션이 섞이지 않게 (T-057-A)
  const activeSections = themeHomeSections(site.sections)
  const hiddenCount = hiddenInThemeCount(site.sections)
  // 미리보기 템플릿 CSS를 부모 레이아웃의 현재 템플릿 위에 덮어쓴다(소스 순서상 후순위 우선).
  const cssVarBody = buildCssVarBody(site.template?.css_variables)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      {cssVarBody && (
        <style
          dangerouslySetInnerHTML={{ __html: `:root { ${cssVarBody} }` }}
        />
      )}

      <PreviewBanner templateName={site.template?.name} hiddenCount={hiddenCount} />

      {/* 편집 UI(EditToolbar·FloatingButtons) 없이 순수 미리보기만 렌더링 */}
      <Navbar tenantName={site.tenant.name} logoUrl={site.site_settings?.logo_url} sections={activeSections} />

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

      <Footer tenantName={site.tenant.name} sns={site.sns_settings} info={site.site_settings} />
    </div>
  )
}
