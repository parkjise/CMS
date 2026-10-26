/**
 * 템플릿 전용 라우트 공통 처리 (app/(code)/tpl-{key}/[tenant_slug]/[[...path]]).
 * 미들웨어가 /{slug}[/{page}[/{id}]] 를 /tpl-{key}/{slug}/... 로 rewrite 한다.
 *
 * - 테넌트가 실제로 이 템플릿을 쓰는지 다시 확인 (캐시 차이로 잘못 들어오면 404)
 * - 페이지 키는 매니페스트에 있는 것만, 상세·글쓰기({id})는 BOARD 페이지만
 * - member/{page} 는 회원 화면을 직접 그리는 템플릿만 (T-124, 회원 기능 꺼져 있으면 404)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { buildLocalBusinessJsonLd, serializeJsonLd } from '@/lib/jsonLd'
import { fetchPublicSite } from '@/lib/publicSite'
import { memberEnabled, type PublicSite } from '@/lib/publicSite.types'
import { countSampleSettings } from '@/lib/sampleCount'
import { CodeTemplateRenderer } from './CodeTemplateRenderer'
import { MEMBER_PAGES, MEMBER_SCREEN_TEMPLATES, isMemberPage, type MemberPageKey } from './memberPages'
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
  /** 방문자 회원 화면 (T-124) */
  memberPage?: MemberPageKey
}

async function resolveMember(
  entry: CodeTemplateEntry,
  params: CodeRouteParams,
): Promise<Resolved | null> {
  const [, page, ...extra] = params.path ?? []
  if (extra.length > 0 || !isMemberPage(page)) return null
  if (!MEMBER_SCREEN_TEMPLATES.has(entry.manifest.key)) return null
  const site = await fetchPublicSite(params.tenant_slug)
  if (!site || !memberEnabled(site)) return null
  if (site.template?.code?.toLowerCase() !== entry.manifest.id.toLowerCase()) return null
  return { site, pageKey: 'member', pageTitle: MEMBER_PAGES[page], memberPage: page }
}

async function resolve(entry: CodeTemplateEntry, params: CodeRouteParams): Promise<Resolved | null> {
  if (params.path?.[0] === 'member') return resolveMember(entry, params)
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
    // 상담 상세(개인 문의) · 회원 화면은 검색엔진 색인 제외
    robots:
      (resolved.pageKey === 'consult' && resolved.detailId) || resolved.memberPage
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
  searchParams: Record<string, string | undefined>
}) {
  const resolved = await resolve(entry, params)
  if (!resolved) notFound()
  const { site, pageKey, detailId, memberPage } = resolved
  const pageSections = site.sections.filter((s) => (s.page_key ?? 'home') === pageKey)

  return (
    <>
      {pageKey === 'home' && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildLocalBusinessJsonLd(site)) }}
        />
      )}
      {!memberPage && <EditToolbar sampleCount={countSampleSettings(pageSections)} />}
      <CodeTemplateRenderer
        entry={entry}
        site={site}
        tenantSlug={params.tenant_slug}
        pageKey={pageKey}
        detailId={detailId}
        query={{ q: searchParams.q, p: searchParams.p }}
        member={memberPage ? { page: memberPage, query: searchParams } : undefined}
      />
    </>
  )
}
