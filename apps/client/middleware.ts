import { NextResponse, type NextRequest } from 'next/server'
import { CODE_ROUTE_PREFIX, codeTemplateKey } from './templates/manifests'
import { MEMBER_SCREEN_TEMPLATES, isMemberPage } from './templates/memberPages'
import { serverApiBase } from './lib/apiBase'
import { BOARD_PATH, NOTICE_BOARD } from './lib/publicPosts'
import { CUSTOM_HOST_HEADER, hostnameFromHeader, isCustomHost } from './lib/siteHost'

/**
 * 코드형 템플릿 라우트 분기 (기획서 11.11 오픈 이슈 #26 — 결정: 미들웨어 rewrite)
 *
 * /{slug}[/{page}[/{id}]] · /{slug}/b/{게시판}[/{글}] 요청에서 테넌트가 코드형 템플릿을 쓰면 템플릿 전용 라우트
 * /tpl-{key}/{slug}/... 로 rewrite 한다 → 그 템플릿의 CSS·JS 는 그 라우트에만 묶인다.
 * - 테마형 · 확인 실패(백엔드 장애) → 그대로 통과 (기존 테마형 라우트)
 * - 미리보기 · 관리자 로그인 · 사이트맵은 기존 라우트 유지
 * - /tpl-* 직접 접근은 404 (내부 주소 노출·중복 콘텐츠 방지)
 */
// 템플릿을 바꾸면 곧바로 새 템플릿 화면이 나와야 한다 (T-125-A).
// 예전 60초 동안은 바뀐 템플릿과 라우트가 어긋나 404 · 이전 템플릿 화면이 나왔다.
// 이 캐시는 미들웨어 메모리라 저장 시 비울 수 없어(공개 사이트 캐시와 달리) 짧게 둔다 — 조회는 가볍다.
export const CACHE_TTL_MS = 3_000
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

/**
 * 테마형 새 게시판 주소가 없는 곳인지 (T-141) — 페이지는 스트리밍이라 상태 코드를 못 바꾼다.
 * 확인 실패(백엔드 장애)면 false — 페이지가 안내 화면을 그린다. 공지는 /notice 가 있어 /b/notice 도 404.
 */
async function isMissingBoardRoute(slug: string, [board, postId, ...extra]: string[]): Promise<boolean> {
  // 회원 글쓰기 · 고치기 (T-150-B) — 게시판만 확인하고, 쓸 수 있는지는 페이지가 본다
  const form = (postId === 'write' && extra.length === 0) || (extra.length === 1 && extra[0] === 'edit')
  if (!board || board === NOTICE_BOARD || (extra.length > 0 && !form)) return true
  const posts = `${serverApiBase()}/public/site/${encodeURIComponent(slug)}/boards/${encodeURIComponent(board)}/posts`
  try {
    const res = await fetch(postId && !form ? `${posts}/${encodeURIComponent(postId)}` : `${posts}?size=1`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
    return res.status === 404 || res.status === 400 || res.status === 422
  } catch {
    return false
  }
}

// 고객 도메인 → slug. 연결 · 해제는 자주 있지 않아 1분, 없는 도메인도 저장해 조회가 쌓이지 않게 (T-137)
const DOMAIN_CACHE_TTL_MS = 60_000
const domainCache = new Map<string, { slug: string | null; expires: number }>()

/** undefined = 확인 실패(백엔드 장애), null = 연결되지 않은 도메인 */
async function slugOfDomain(hostname: string): Promise<string | null | undefined> {
  const hit = domainCache.get(hostname)
  if (hit && hit.expires > Date.now()) return hit.slug
  try {
    const res = await fetch(`${serverApiBase()}/public/domain/${encodeURIComponent(hostname)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    })
    if (res.status !== 200 && res.status !== 404) return undefined
    const slug =
      res.status === 200 ? ((await res.json()) as { data: { slug: string } }).data.slug : null
    domainCache.set(hostname, { slug, expires: Date.now() + DOMAIN_CACHE_TTL_MS })
    return slug
  } catch {
    return undefined
  }
}

/** 테스트용 — 캐시 비우기 */
export function clearTemplateCache() {
  cache.clear()
  domainCache.clear()
}

export async function middleware(request: NextRequest) {
  // 방문자가 보낸 값을 믿지 않는다 — 아래에서 확인한 도메인만 다시 넣는다
  const headers = new Headers(request.headers)
  headers.delete(CUSTOM_HOST_HEADER)
  const hostname = hostnameFromHeader(request.headers.get('host'))
  if (!isCustomHost(hostname)) return routeTenant(request, request.nextUrl.pathname, headers)

  const slug = await slugOfDomain(hostname)
  if (slug === undefined) return new NextResponse('Service Unavailable', { status: 503 })
  if (slug === null) return new NextResponse('Not Found', { status: 404 })

  const { pathname } = request.nextUrl
  // 고객 도메인의 정식 주소에는 slug 가 없다 — 옛 링크 · 메인 주소 기준 링크는 옮겨 준다.
  // 프록시 뒤라 nextUrl 의 호스트 · 스킴은 내부 값이다 — 방문자가 접속한 값으로 만든다
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    const target = pathname.slice(slug.length + 1) || '/'
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
    const origin = `${proto}://${request.headers.get('host')}`
    return NextResponse.redirect(new URL(`${target}${request.nextUrl.search}`, origin), 301)
  }
  headers.set(CUSTOM_HOST_HEADER, hostname)
  return routeTenant(request, pathname === '/' ? `/${slug}` : `/${slug}${pathname}`, headers)
}

/** /{slug}/... 경로를 템플릿 라우트로 — 고객 도메인도 slug 를 붙여 같은 길로 */
async function routeTenant(request: NextRequest, pathname: string, headers: Headers) {
  const rewriteTo = (target: string) => {
    const url = request.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url, { request: { headers } })
  }
  const pass = () =>
    pathname === request.nextUrl.pathname
      ? NextResponse.next({ request: { headers } })
      : rewriteTo(pathname)

  const segments = pathname.split('/').filter(Boolean)
  const [slug, page] = segments

  if (!slug || RESERVED_ROOTS.has(slug) || slug === 'sitemap.xml') return pass()
  if (slug.startsWith(CODE_ROUTE_PREFIX) || (segments.length > 1 && segments[1].startsWith(CODE_ROUTE_PREFIX))) {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (page === MEMBER_PAGE) {
    const route = await siteRouteOf(slug)
    if (route && !route.memberEnabled) return new NextResponse('Not Found', { status: 404 })
    // 회원 화면을 직접 그리는 코드형 템플릿이면 그 템플릿 라우트로 (헤더 · 푸터 안, T-124)
    const key = codeTemplateKey(route?.code ?? null)
    if (key && MEMBER_SCREEN_TEMPLATES.has(key) && segments.length === 3 && isMemberPage(segments[2])) {
      return rewriteTo(`/${CODE_ROUTE_PREFIX}${key}/${segments.join('/')}`)
    }
    return pass()
  }
  const isBoard = page === BOARD_PATH
  if (!isBoard && (segments.length > 3 || (page && RESERVED_PAGES.has(page)))) return pass()

  const key = codeTemplateKey((await siteRouteOf(slug))?.code ?? null)
  if (!key) {
    // /{slug}/b 는 받는 화면이 없어 공통 404 화면 + 404 상태로 끝난다
    if (isBoard && (await isMissingBoardRoute(slug, segments.slice(2)))) return rewriteTo(`/${slug}/${BOARD_PATH}`)
    return pass()
  }
  return rewriteTo(`/${CODE_ROUTE_PREFIX}${key}/${segments.join('/')}`)
}

export const config = {
  // 정적 파일 · Next 내부 · 공용 템플릿 이미지는 제외
  // /sitemap.xml 은 고객 도메인의 사이트맵 (T-137)
  matcher: [
    '/sitemap.xml',
    '/((?!_next/|api/|templates/|favicon\\.ico|robots\\.txt|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}
