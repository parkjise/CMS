import { NextResponse, type NextRequest } from 'next/server'
import { CODE_ROUTE_PREFIX, codeTemplateKey } from './templates/manifests'
import { MEMBER_SCREEN_TEMPLATES, isMemberPage } from './templates/memberPages'
import { serverApiBase } from './lib/apiBase'

/**
 * 코드형 템플릿 라우트 분기 (기획서 11.11 오픈 이슈 #26 — 결정: 미들웨어 rewrite)
 *
 * /{slug}[/{page}[/{id}]] 요청에서 테넌트가 코드형 템플릿을 쓰면 템플릿 전용 라우트
 * /tpl-{key}/{slug}/... 로 rewrite 한다 → 그 템플릿의 CSS·JS 는 그 라우트에만 묶인다.
 * - 테마형 · 확인 실패(백엔드 장애) → 그대로 통과 (기존 테마형 라우트)
 * - 미리보기 · 관리자 로그인 · 사이트맵은 기존 라우트 유지
 * - /tpl-* 직접 접근은 404 (내부 주소 노출·중복 콘텐츠 방지)
 */
const CACHE_TTL_MS = 60_000 // 공개 사이트 재검증 주기와 같게
const RESERVED_PAGES = new Set(['preview', 'login', 'sitemap.xml'])
// 방문자 회원 화면 — 모든 테넌트 공통 라우트 app/[tenant_slug]/member (T-113).
// 회원 기능(SITE_MEMBER)이 꺼진 테넌트는 여기서 404 (페이지는 스트리밍이라 상태 코드를 못 바꿈, T-115)
const MEMBER_PAGE = 'member'
// 테넌트가 아닌 최상위 경로 — /member/social/callback (T-110 소셜 공용 콜백)
const RESERVED_ROOTS = new Set(['member'])

interface SiteRoute {
  /** 코드형 템플릿 코드 (테마형이면 null) */
  code: string | null
  /** 방문자 회원 기능 (SITE_MEMBER) */
  memberEnabled: boolean
}

const cache = new Map<string, SiteRoute & { expires: number }>()

/** 테넌트 라우팅 정보 — 실패(백엔드 장애 · 없는 테넌트)면 null 로 그대로 통과 */
async function siteRouteOf(slug: string): Promise<SiteRoute | null> {
  const hit = cache.get(slug)
  if (hit && hit.expires > Date.now()) return hit
  let route: SiteRoute = { code: null, memberEnabled: false }
  try {
    const res = await fetch(`${serverApiBase()}/public/site/${encodeURIComponent(slug)}/template`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      data?: { code?: string | null; renderer?: string; member_enabled?: boolean }
    }
    route = {
      code: body.data?.renderer === 'code' ? (body.data.code ?? null) : null,
      memberEnabled: Boolean(body.data?.member_enabled),
    }
  } catch {
    return null // 장애 시 캐시하지 않고 그대로 통과 (회원 화면은 레이아웃에서 한 번 더 확인)
  }
  cache.set(slug, { ...route, expires: Date.now() + CACHE_TTL_MS })
  return route
}

/** 테스트용 — 캐시 비우기 */
export function clearTemplateCache() {
  cache.clear()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const segments = pathname.split('/').filter(Boolean)
  const [slug, page] = segments

  if (!slug || RESERVED_ROOTS.has(slug)) return NextResponse.next()
  if (slug.startsWith(CODE_ROUTE_PREFIX)) {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (page === MEMBER_PAGE) {
    const route = await siteRouteOf(slug)
    if (route && !route.memberEnabled) return new NextResponse('Not Found', { status: 404 })
    // 회원 화면을 직접 그리는 코드형 템플릿이면 그 템플릿 라우트로 (헤더 · 푸터 안, T-124)
    const key = codeTemplateKey(route?.code ?? null)
    if (key && MEMBER_SCREEN_TEMPLATES.has(key) && segments.length === 3 && isMemberPage(segments[2])) {
      const url = request.nextUrl.clone()
      url.pathname = `/${CODE_ROUTE_PREFIX}${key}/${segments.join('/')}`
      return NextResponse.rewrite(url)
    }
    return NextResponse.next()
  }
  if (segments.length > 3 || (page && RESERVED_PAGES.has(page))) return NextResponse.next()

  const key = codeTemplateKey((await siteRouteOf(slug))?.code ?? null)
  if (!key) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = `/${CODE_ROUTE_PREFIX}${key}/${segments.join('/')}`
  return NextResponse.rewrite(url)
}

export const config = {
  // 정적 파일 · Next 내부 · 공용 템플릿 이미지는 제외
  matcher: ['/((?!_next/|api/|templates/|favicon\\.ico|robots\\.txt|.*\\.[a-zA-Z0-9]+$).*)'],
}
