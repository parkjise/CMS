import { NextResponse, type NextRequest } from 'next/server'
import { CODE_ROUTE_PREFIX, codeTemplateKey } from './templates/manifests'

/**
 * 코드형 템플릿 라우트 분기 (기획서 11.11 오픈 이슈 #26 — 결정: 미들웨어 rewrite)
 *
 * /{slug}[/{page}[/{id}]] 요청에서 테넌트가 코드형 템플릿을 쓰면 템플릿 전용 라우트
 * /tpl-{key}/{slug}/... 로 rewrite 한다 → 그 템플릿의 CSS·JS 는 그 라우트에만 묶인다.
 * - 테마형 · 확인 실패(백엔드 장애) → 그대로 통과 (기존 테마형 라우트)
 * - 미리보기 · 관리자 로그인 · 사이트맵은 기존 라우트 유지
 * - /tpl-* 직접 접근은 404 (내부 주소 노출·중복 콘텐츠 방지)
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'
const CACHE_TTL_MS = 60_000 // 공개 사이트 재검증 주기와 같게
const RESERVED_PAGES = new Set(['preview', 'login', 'sitemap.xml'])

const cache = new Map<string, { code: string | null; expires: number }>()

async function templateCodeOf(slug: string): Promise<string | null> {
  const hit = cache.get(slug)
  if (hit && hit.expires > Date.now()) return hit.code
  let code: string | null = null
  try {
    const res = await fetch(`${API_BASE}/public/site/${encodeURIComponent(slug)}/template`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      const body = (await res.json()) as { data?: { code?: string | null; renderer?: string } }
      code = body.data?.renderer === 'code' ? (body.data.code ?? null) : null
    }
  } catch {
    return null // 장애 시 캐시하지 않고 테마형으로 통과
  }
  cache.set(slug, { code, expires: Date.now() + CACHE_TTL_MS })
  return code
}

/** 테스트용 — 캐시 비우기 */
export function clearTemplateCache() {
  cache.clear()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const segments = pathname.split('/').filter(Boolean)
  const [slug, page] = segments

  if (!slug) return NextResponse.next()
  if (slug.startsWith(CODE_ROUTE_PREFIX)) {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (segments.length > 3 || (page && RESERVED_PAGES.has(page))) return NextResponse.next()

  const key = codeTemplateKey(await templateCodeOf(slug))
  if (!key) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = `/${CODE_ROUTE_PREFIX}${key}/${segments.join('/')}`
  return NextResponse.rewrite(url)
}

export const config = {
  // 정적 파일 · Next 내부 · 공용 템플릿 이미지는 제외
  matcher: ['/((?!_next/|api/|templates/|favicon\\.ico|robots\\.txt|.*\\.[a-zA-Z0-9]+$).*)'],
}
