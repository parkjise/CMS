import type { PublicSitemapPost } from '@cms/types'
import { NOTICE_BOARD, boardPageKey, fetchSitemapPosts } from '@/lib/publicPosts'
import { fetchPublicSite } from '@/lib/publicSite'
import type { PublicSite } from '@/lib/publicSite.types'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { CODE_TEMPLATE_MANIFESTS, codeTemplateKey } from '@/templates/manifests'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const customHostOf = (request: Request) => request.headers.get(CUSTOM_HOST_HEADER)

interface Context {
  params: Promise<{ tenant_slug: string }>
}

interface SitemapUrl {
  path: string
  lastmod: string
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSitemap(urls: Array<{ loc: string; lastmod: string }>): string {
  const items = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`
}

/** 메인 뒤에 붙는 주소 (T-140-C) — 코드형 템플릿만. 테마형은 한 페이지뿐이고 게시판은 T-141 */
function sitePaths(site: PublicSite, posts: PublicSitemapPost[]): SitemapUrl[] {
  const key = codeTemplateKey(site.template?.renderer === 'code' ? site.template.code : null)
  const manifest = CODE_TEMPLATE_MANIFESTS.find((m) => m.key === key)
  if (!manifest) return []
  // 메뉴에서 숨긴 곳은 아직 준비 중일 수 있어 알리지 않는다. 주소로는 그대로 열린다
  const hidden = new Set(
    (site.site_settings?.menu_items ?? []).filter((item) => item.visible === false).map((item) => item.key),
  )
  const now = new Date().toISOString()
  const pages = manifest.pages
    .filter((page) => page.key !== 'home' && !hidden.has(page.key))
    .map((page) => ({ path: `/${page.key}`, lastmod: now }))
  const boards = (site.boards ?? []).filter((board) => !hidden.has(`board:${board.id}`))
  const newest = new Map<string, string>()
  const postUrls = posts.flatMap((post) => {
    const base = post.is_system
      ? post.board_slug === NOTICE_BOARD && !hidden.has(NOTICE_BOARD)
        ? `/${NOTICE_BOARD}`
        : null
      : boards.some((board) => board.slug === post.board_slug)
        ? `/${boardPageKey(post.board_slug)}`
        : null
    if (!base) return []
    // 글은 최근 수정 순 — 처음 만난 값이 게시판의 최종 수정일
    if (!newest.has(post.board_slug)) newest.set(post.board_slug, post.updated_at)
    return [{ path: `${base}/${post.id}`, lastmod: post.updated_at }]
  })
  return [
    ...pages,
    ...boards.map((board) => ({
      path: `/${boardPageKey(board.slug)}`,
      lastmod: newest.get(board.slug) ?? now,
    })),
    ...postUrls,
  ]
}

export async function GET(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const { tenant_slug } = await params
  const site = await fetchPublicSite(tenant_slug)
  if (!site) {
    return new Response(buildSitemap([]), {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  // 고객 도메인으로 들어오면 그 주소로 (T-137)
  const host = customHostOf(request)
  const base = host ? `https://${host}` : `${SITE_URL}/${tenant_slug}`
  const posts = (await fetchSitemapPosts(tenant_slug)) ?? []
  const xml = buildSitemap([
    { loc: base, lastmod: new Date().toISOString() },
    ...sitePaths(site, posts).map(({ path, lastmod }) => ({ loc: `${base}${path}`, lastmod })),
  ])

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
