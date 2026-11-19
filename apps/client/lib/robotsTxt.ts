import type { CrawlerPolicy } from '@cms/types'

/**
 * GEO 의 AI 크롤러 정책을 robots.txt 에 더한다 (T-221, 사이트 관리 SM-06).
 * SEO 설정의 robots.txt 가 이미 규칙을 둔 크롤러는 그 규칙을 따른다 — 관리자 미리보기(robotsPreview.ts)와 같은 규칙.
 */
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const mentionsAgent = (base: string, agent: string): boolean =>
  new RegExp(`^\\s*user-agent:\\s*${escape(agent)}\\s*$`, 'im').test(base)

export function composeRobotsTxt(base: string, crawlers: Record<string, CrawlerPolicy>): string {
  const blocks = Object.entries(crawlers)
    .filter(([name, policy]) => policy !== 'keep' && !mentionsAgent(base, name))
    .map(
      ([name, policy]) => `User-agent: ${name}\n${policy === 'block' ? 'Disallow: /' : 'Allow: /'}`
    )
  if (blocks.length === 0) return base
  return `${base.trimEnd()}\n\n# AI 크롤러 (사이트 관리 → GEO 설정)\n${blocks.join('\n\n')}\n`
}
