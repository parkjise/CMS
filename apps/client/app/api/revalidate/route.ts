import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

/**
 * 홈페이지 데이터 캐시 비우기 (T-066-A) — 백엔드가 콘텐츠 저장 직후 호출한다.
 * (backend services/site_cache.py → POST {CLIENT_INTERNAL_URL}/api/revalidate)
 *
 * 공개 사이트 조회는 `site:{slug}` 태그로 60초 캐시된다 (lib/publicSite.ts).
 * 비밀 키(REVALIDATE_SECRET)가 맞을 때만 그 태그를 비운다.
 */

const SECRET_HEADER = 'x-revalidate-secret'
// 백엔드 테넌트 슬러그 규칙과 같음 (schemas/super_tenant.py)
const SLUG_RE = /^[a-z0-9-]{1,100}$/
const MAX_SLUGS = 1000

const secretMatches = (given: string | null, expected: string) => {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return NextResponse.json({ revalidated: false, reason: 'disabled' }, { status: 503 })
  }
  if (!secretMatches(request.headers.get(SECRET_HEADER), secret)) {
    return NextResponse.json({ revalidated: false }, { status: 401 })
  }

  let slugs: unknown
  try {
    slugs = ((await request.json()) as { slugs?: unknown }).slugs
  } catch {
    slugs = null
  }
  if (
    !Array.isArray(slugs) ||
    slugs.length === 0 ||
    slugs.length > MAX_SLUGS ||
    !slugs.every((s) => typeof s === 'string' && SLUG_RE.test(s))
  ) {
    return NextResponse.json({ revalidated: false }, { status: 400 })
  }

  for (const slug of slugs as string[]) revalidateTag(`site:${slug}`)
  return NextResponse.json({ revalidated: true, count: slugs.length })
}
