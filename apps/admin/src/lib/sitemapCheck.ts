/** 홈페이지 사이트맵 결과 (T-225) — 관리자 SEO 화면 [생성 결과 확인] */
export interface SitemapSummary {
  /** 메인 뒤 경로 — 메인은 '/' */
  paths: string[]
  pages: number
  posts: number
}

// 글 주소는 마지막 칸이 글 id(UUID)
const POST_ID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function summarizeSitemap(xml: string, base: string): SitemapSummary {
  const locs = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) => m[1])
  const paths = locs.map((loc) => (loc.startsWith(base) ? loc.slice(base.length) : loc) || '/')
  const posts = paths.filter((path) => POST_ID.test(path)).length
  return { paths, posts, pages: paths.length - posts }
}
