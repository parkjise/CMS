import { serverApiBase } from '@/lib/apiBase'
import { fetchPublicSite } from '@/lib/publicSite'
import { composeRobotsTxt } from '@/lib/robotsTxt'
import { hostnameFromHeader, isCustomHost, mainSiteUrl } from '@/lib/siteHost'

const text = (body: string) =>
  new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })

const mainRobots = () => `User-Agent: *\nAllow: /\n\nHost: ${mainSiteUrl()}\n`

/** 메인은 공용 값, 고객 도메인은 관리자 SEO 의 robots.txt (T-137, 비우면 전체 허용 + 사이트맵) + GEO 크롤러 정책 (T-221) */
export async function GET(request: Request): Promise<Response> {
  const hostname = hostnameFromHeader(request.headers.get('host'))
  if (!isCustomHost(hostname)) return text(mainRobots())

  const res = await fetch(`${serverApiBase()}/public/domain/${encodeURIComponent(hostname)}`, {
    signal: AbortSignal.timeout(2000),
  }).catch(() => null)
  if (!res?.ok) return text(mainRobots())
  const { data } = (await res.json()) as { data: { slug: string } }
  const site = await fetchPublicSite(data.slug)
  const custom = site?.seo_settings?.robots_txt?.trim()
  const base = custom
    ? `${custom}\n`
    : `User-Agent: *\nAllow: /\n\nSitemap: https://${hostname}/sitemap.xml\n`
  // GEO 의 AI 크롤러 정책 (T-221)
  return text(composeRobotsTxt(base, site?.seo_settings?.geo?.crawlers ?? {}))
}
