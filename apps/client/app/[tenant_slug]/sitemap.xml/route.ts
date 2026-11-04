import { fetchPublicSite } from '@/lib/publicSite'

import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const customHostOf = (request: Request) => request.headers.get(CUSTOM_HOST_HEADER)

interface Context {
  params: Promise<{ tenant_slug: string }>
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

  const xml = buildSitemap([
    {
      // 고객 도메인으로 들어오면 그 주소로 (T-137)
      loc: customHostOf(request) ? `https://${customHostOf(request)}` : `${SITE_URL}/${tenant_slug}`,
      lastmod: new Date().toISOString(),
    },
  ])

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
