import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchPublicSite } from '@/lib/publicSite'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { CodeTemplateRenderer } from '@/templates/CodeTemplateRenderer'
import { resolveCodeTemplate } from '@/templates/registry'

interface Props {
  params: Promise<{ tenant_slug: string; page: string; id: string }>
}

// 게시판 상세·글쓰기가 있는 페이지 (BOARD 섹션) — 공지 상세 /notice/{id} · 상담 상세 /consult/{id} · 글쓰기 /consult/write
const BOARD_PAGES = new Set(['notice', 'consult'])

async function resolve(tenantSlug: string, pageKey: string) {
  if (!BOARD_PAGES.has(pageKey)) return null
  const site = await fetchPublicSite(tenantSlug)
  if (!site) return null
  const entry = resolveCodeTemplate(site)
  const page = entry?.manifest.pages.find((p) => p.key === pageKey)
  if (!entry || !page || !page.default_sections.includes('BOARD')) return null
  return { site, entry, page }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant_slug, page, id } = await params
  const resolved = await resolve(tenant_slug, page)
  if (!resolved) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }
  const title = id === 'write' ? '글쓰기' : resolved.page.tab_title ?? resolved.page.title
  // 상담 상세는 개인 문의라 검색엔진 색인 제외
  return {
    title: `${title} | ${resolved.site.tenant.name}`,
    robots: page === 'consult' ? { index: false, follow: false } : undefined,
  }
}

/** 코드형 템플릿 게시판 상세·글쓰기 (기획서 11.9, T-123) */
export default async function TenantBoardDetailPage({ params }: Props) {
  const { tenant_slug, page, id } = await params
  const resolved = await resolve(tenant_slug, page)
  if (!resolved) notFound()
  return (
    <>
      <EditToolbar />
      <CodeTemplateRenderer
        entry={resolved.entry}
        site={resolved.site}
        tenantSlug={tenant_slug}
        pageKey={page}
        detailId={decodeURIComponent(id)}
      />
    </>
  )
}
