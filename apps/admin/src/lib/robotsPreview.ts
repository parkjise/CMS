import type { CrawlerPolicy } from '@cms/types'

/**
 * GEO 의 AI 크롤러 정책을 robots.txt 에 더한 모습 (T-221).
 * 홈페이지 apps/client/lib/robotsTxt.ts 와 같은 규칙 — 미리보기라 여기 따로 둔다.
 */
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** SEO 설정의 robots.txt 가 이미 규칙을 둔 크롤러 — 그 규칙을 따르고 GEO 정책은 더하지 않는다 */
export const mentionsAgent = (base: string, agent: string): boolean =>
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
