import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { fetchPublicSite, fetchSectionDraft, fetchTemplatePreview } from '@/lib/publicSite'
import type { PublicSite } from '@/lib/publicSite.types'
import { boardPageKey } from '@/lib/publicPosts'
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
  searchParams: Promise<{ tpl?: string; draft?: string; content?: string; page?: string; id?: string; q?: string; p?: string; c?: string }>
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
  const { tpl, draft, content, page, id, q, p, c } = await searchParams

  // 저장 전 미리보기 (T-206) — 관리자 섹션 편집의 [미리보기]
  if (draft) {
    return <SectionDraftPreview tenantSlug={tenant_slug} token={draft} pageKey={page} detailId={id} query={{ q, p, c }} />
  }

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
    // 새 게시판은 내 콘텐츠 미리보기에서만 — 샘플 미리보기는 디자인 원본 (T-140-B)
    const board =
      content === 'mine' ? tenantSite.boards?.find((b) => boardPageKey(b.slug) === pageKey) : undefined
    if (!board && !codeTemplate.manifest.pages.some((p) => p.key === pageKey)) {
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
          query={{ q, p, c }}
          board={board}
        />
      </>
    )
  }

  const site = await fetchTemplatePreview(tenant_slug, tpl)
  if (!site) {
    notFound()
  }

  return (
    <ThemePreview
      site={site}
      tenantSlug={tenant_slug}
      cssVarBody={buildCssVarBody(site.template?.css_variables)}
      banner={<PreviewBanner templateName={site.template?.name} hiddenCount={hiddenInThemeCount(site.sections)} />}
    />
  )
}

interface DraftProps {
  tenantSlug: string
  token: string
  pageKey?: string
  detailId?: string
  query: { q?: string; p?: string; c?: string }
}

/** 저장하지 않은 섹션 설정을 덮어 지금 템플릿으로 그린다 (T-206). 토큰은 10분 */
async function SectionDraftPreview({ tenantSlug, token, pageKey, detailId, query }: DraftProps) {
  const site = await fetchSectionDraft(tenantSlug, token)
  if (!site) {
    return (
      <>
        <PreviewBanner draft />
        <section className="px-6 py-24 text-center">
          <p className="text-base text-slate-600">
            미리보기 시간이 지났어요. 관리자 화면에서 [미리보기]를 다시 눌러주세요.
          </p>
        </section>
      </>
    )
  }
  const codeTemplate = site.template?.code ? findCodeTemplate(site.template.code) : undefined
  if (codeTemplate) {
    const key = pageKey ?? 'home'
    const board = site.boards?.find((b) => boardPageKey(b.slug) === key)
    if (!board && !codeTemplate.manifest.pages.some((pg) => pg.key === key)) {
      notFound()
    }
    return (
      <>
        <PreviewBanner draft />
        <CodeTemplateRenderer
          entry={codeTemplate}
          site={site}
          tenantSlug={tenantSlug}
          pageKey={key}
          preview
          contentSource="tenant"
          previewQuery={`draft=${encodeURIComponent(token)}`}
          detailId={detailId}
          query={query}
          board={board}
        />
      </>
    )
  }
  // 테마형은 지금 템플릿 CSS 가 레이아웃에 이미 있다
  return <ThemePreview site={site} tenantSlug={tenantSlug} banner={<PreviewBanner draft />} />
}

interface ThemePreviewProps {
  site: PublicSite
  tenantSlug: string
  banner: ReactNode
  /** 미리보는 템플릿 CSS — 부모 레이아웃의 현재 템플릿 위에 덮어쓴다 */
  cssVarBody?: string
}

function ThemePreview({ site, tenantSlug, banner, cssVarBody }: ThemePreviewProps) {
  // 홈 페이지의 그릴 수 있는 섹션만 — 메뉴가 넘치거나 하위 페이지 섹션이 섞이지 않게 (T-057-A)
  const activeSections = themeHomeSections(site.sections, site.boards)

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      {cssVarBody && (
        <style
          dangerouslySetInnerHTML={{ __html: `:root { ${cssVarBody} }` }}
        />
      )}

      {banner}

      {/* 편집 UI(EditToolbar·FloatingButtons) 없이 순수 미리보기만 렌더링 */}
      <Navbar tenantName={site.tenant.name} logoUrl={site.site_settings?.logo_url} menuItems={site.site_settings?.menu_items} sections={activeSections} />

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
              tenantSlug={tenantSlug}
              boards={site.boards}
            />
          ))
        )}
      </main>

      <Footer tenantName={site.tenant.name} sns={site.sns_settings} info={site.site_settings} />
    </div>
  )
}
