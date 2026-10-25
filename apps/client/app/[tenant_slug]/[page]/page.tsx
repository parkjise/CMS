import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import { countSampleSettings } from '@/lib/sampleCount'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import { resolveCodeTemplate } from '@/templates/registry'

interface Props {
  params: Promise<{ tenant_slug: string; page: string }>
}

/** 코드형 템플릿 서브 페이지 찾기 — 테마형 템플릿이거나 없는 페이지면 null (404) */
async function resolvePage(tenantSlug: string, pageKey: string) {
  if (pageKey === 'home') return null // 메인은 /{slug}
  const site = await fetchPublicSite(tenantSlug)
  if (!site) return null
  const entry = resolveCodeTemplate(site)
  const page = entry?.manifest.pages.find((p) => p.key === pageKey)
  if (!entry || !page) return null
  return { site, entry, page }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug, page } = await params
  const resolved = await resolvePage(tenant_slug, page)
  if (!resolved) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }
  return { title: `${resolved.page.title} | ${resolved.site.tenant.name}` }
}

/**
 * 코드형 템플릿 서브 페이지 (기획서 11.9) — /{slug}/{page_key}
 * 매니페스트 pages 에 있는 키만 열리고, 테마형 템플릿 테넌트는 서브 페이지가 없어 404.
 */
export default async function TenantSubPage({ params }: Props) {
  const { tenant_slug, page } = await params
  const resolved = await resolvePage(tenant_slug, page)
  if (!resolved) notFound()

  const { site, entry } = resolved
  const pageSections = site.sections.filter((s) => (s.page_key ?? 'home') === page)

  return (
    <>
      <EditToolbar sampleCount={countSampleSettings(pageSections)} />
      <CodeTemplateRenderer entry={entry} site={site} tenantSlug={tenant_slug} pageKey={page} />
    </>
  )
}
