/**
 * 템플릿 전용 라우트 공통 처리 (app/(code)/tpl-{key}/[tenant_slug]/[[...path]]).
 * 미들웨어가 /{slug}[/{page}[/{id}]] 를 /tpl-{key}/{slug}/... 로 rewrite 한다.
 *
 * - 테넌트가 실제로 이 템플릿을 쓰는지 다시 확인 (캐시 차이로 잘못 들어오면 404)
 * - 페이지 키는 매니페스트에 있는 것만, 상세·글쓰기({id})는 BOARD 페이지만
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { buildLocalBusinessJsonLd, serializeJsonLd } from '@/lib/jsonLd'
import { fetchPublicSite } from '@/lib/publicSite'
import type { PublicSite } from '@/lib/publicSite.types'
import { countSampleSettings } from '@/lib/sampleCount'
import { CodeTemplateRenderer } from './CodeTemplateRenderer'
import type { CodeTemplateEntry } from './shared/contracts'

export interface CodeRouteParams {
  tenant_slug: string
  path?: string[]
}

interface Resolved {
  site: PublicSite
  pageKey: string
  detailId?: string
  pageTitle: string
}

async function resolve(entry: CodeTemplateEntry, params: CodeRouteParams): Promise<Resolved | null> {
  const [pageKey = 'home', detailId, ...extra] = params.path ?? []
  if (extra.length > 0 || pageKey === 'home' && params.path?.length) return null
  const page = entry.manifest.pages.find((p) => p.key === pageKey)
  if (!page) return null
  if (detailId && !page.default_sections.includes('BOARD')) return null

  const site = await fetchPublicSite(params.tenant_slug)
  if (!site) return null
  const code = site.template?.code?.toLowerCase()
  if (code !== entry.manifest.id.toLowerCase()) return null

  return {
    site,
    pageKey,
    detailId: detailId ? decodeURIComponent(detailId) : undefined,
    pageTitle: detailId === 'write' ? '글쓰기' : (page.tab_title ?? page.title),
  }
}

export async function codeRouteMetadata(
  entry: CodeTemplateEntry,
  params: CodeRouteParams,
): Promise<Metadata> {
  const resolved = await resolve(entry, params)
  if (!resolved) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }
  if (resolved.pageKey === 'home') return {} // 메인은 [tenant_slug] 레이아웃 메타 그대로
  return {
    title: `${resolved.pageTitle} | ${resolved.site.tenant.name}`,
    // 상담 상세는 개인 문의라 검색엔진 색인 제외
    robots:
      resolved.pageKey === 'consult' && resolved.detailId
        ? { index: false, follow: false }
        : undefined,
  }
}

export async function CodeRoutePage({
  entry,
  params,
  searchParams,
}: {
  entry: CodeTemplateEntry
  params: CodeRouteParams
  searchParams: { q?: string; p?: string }
}) {
  const resolved = await resolve(entry, params)
  if (!resolved) notFound()
  const { site, pageKey, detailId } = resolved
  const pageSections = site.sections.filter((s) => (s.page_key ?? 'home') === pageKey)

  return (
    <>
      {pageKey === 'home' && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildLocalBusinessJsonLd(site)) }}
        />
      )}
      <EditToolbar sampleCount={countSampleSettings(pageSections)} />
      <CodeTemplateRenderer
        entry={entry}
        site={site}
        tenantSlug={params.tenant_slug}
        pageKey={pageKey}
        detailId={detailId}
        query={{ q: searchParams.q, p: searchParams.p }}
      />
    </>
  )
}
