import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { CACHE_TTL_MS, clearTemplateCache, middleware } from '@/middleware'

/** 미들웨어 — 코드형 템플릿 라우트 분기 (T-125, 오픈 이슈 #26) */
const fetchMock = vi.fn()

const templateResponse = (
  code: string | null,
  renderer = code ? 'code' : 'theme',
  memberEnabled = true,
) =>
  new Response(
    JSON.stringify({ success: true, data: { code, renderer, member_enabled: memberEnabled } }),
    { status: 200 },
  )

const run = (path: string) => middleware(new NextRequest(new URL(path, 'http://localhost:3000')))
const rewriteOf = (res: Response) => res.headers.get('x-middleware-rewrite')

beforeEach(() => {
  clearTemplateCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('middleware — 템플릿별 라우트 분기', () => {
  it('코드형 템플릿 테넌트는 템플릿 전용 라우트로 rewrite (쿼리 유지)', async () => {
    fetchMock.mockResolvedValue(templateResponse('TPL_HOSPITAL_A'))
    expect(rewriteOf(await run('/clinic'))).toBe('http://localhost:3000/tpl-hospital-a/clinic')
    expect(rewriteOf(await run('/clinic/about'))).toBe('http://localhost:3000/tpl-hospital-a/clinic/about')
    expect(rewriteOf(await run('/clinic/notice?q=%EC%9A%B4&p=2'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/notice?q=%EC%9A%B4&p=2',
    )
    expect(rewriteOf(await run('/clinic/consult/write'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/consult/write',
    )
  })

  describe('테마형 새 게시판 주소 — 없으면 실제 404 (T-141)', () => {
    const apiResponse = (status: number) => (url: string) =>
      Promise.resolve(
        url.includes('/template') ? templateResponse(null, 'theme') : new Response('{}', { status }),
      )
    const MISSING = 'http://localhost:3000/clinic/b'

    it('있는 게시판 · 글은 그대로 통과', async () => {
      fetchMock.mockImplementation(apiResponse(200))
      expect(rewriteOf(await run('/clinic/b/news'))).toBeNull()
      expect(rewriteOf(await run('/clinic/b/news/p1'))).toBeNull()
      expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('/boards/news/posts/p1')
    })

    it.each([404, 400, 422])('API 가 %s 이면 404 화면으로', async (status) => {
      fetchMock.mockImplementation(apiResponse(status))
      expect(rewriteOf(await run('/clinic/b/gone'))).toBe(MISSING)
    })

    it('공지 · 더 깊은 주소는 묻지 않고 404', async () => {
      fetchMock.mockImplementation(apiResponse(200))
      expect(rewriteOf(await run('/clinic/b/notice'))).toBe(MISSING)
      expect(rewriteOf(await run('/clinic/b/news/p1/extra'))).toBe(MISSING)
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/boards/'))).toBe(false)
    })

    it('공지 /notice[/{글}] 도 있는지 묻고, 없거나 더 깊으면 404 (T-176)', async () => {
      fetchMock.mockImplementation(apiResponse(200))
      expect(rewriteOf(await run('/clinic/notice'))).toBeNull()
      expect(rewriteOf(await run('/clinic/notice/p1'))).toBeNull()
      expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('/boards/notice/posts/p1')
      expect(rewriteOf(await run('/clinic/notice/write'))).toBeNull()
      expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('/boards/notice/posts/write')
      expect(rewriteOf(await run('/clinic/notice/p1/edit'))).toBe(MISSING)
      clearTemplateCache()
      fetchMock.mockImplementation(apiResponse(404))
      expect(rewriteOf(await run('/clinic/notice'))).toBe(MISSING)
    })

    it('확인 실패(장애)면 통과 — 페이지가 안내', async () => {
      fetchMock.mockImplementation(apiResponse(500))
      expect(rewriteOf(await run('/clinic/b/news'))).toBeNull()
      clearTemplateCache()
      fetchMock.mockImplementation((url: string) =>
        url.includes('/template') ? Promise.resolve(templateResponse(null, 'theme')) : Promise.reject(new Error('down')),
      )
      expect(rewriteOf(await run('/clinic/b/news'))).toBeNull()
    })
  })

  it('새 게시판 주소 /b/{게시판}[/{글}] 도 템플릿 라우트로, 더 깊은 주소도 거기서 404 (T-140-B)', async () => {
    fetchMock.mockResolvedValue(templateResponse('TPL_HOSPITAL_A'))
    expect(rewriteOf(await run('/clinic/b/news'))).toBe('http://localhost:3000/tpl-hospital-a/clinic/b/news')
    expect(rewriteOf(await run('/clinic/b/news/post-1?q=a'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/b/news/post-1?q=a',
    )
    expect(rewriteOf(await run('/clinic/b/news/post-1/extra'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/b/news/post-1/extra',
    )
    expect(rewriteOf(await run('/clinic/about/a/b'))).toBeNull()
  })

  it('회원 화면을 그리는 코드형 템플릿(hospital-a)이면 템플릿 라우트로 rewrite (T-124)', async () => {
    fetchMock.mockResolvedValue(templateResponse('TPL_HOSPITAL_A'))
    expect(rewriteOf(await run('/clinic/member/login'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/member/login',
    )
    expect(rewriteOf(await run('/clinic/member/reset-password?token=x'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/member/reset-password?token=x',
    )
    // 없는 회원 화면은 그대로 통과 (공통 라우트에서 404)
    expect(rewriteOf(await run('/clinic/member/unknown'))).toBeNull()
  })

  it('테마형 테넌트의 회원 화면은 공통 라우트 그대로 (T-113)', async () => {
    fetchMock.mockResolvedValue(templateResponse(null, 'theme'))
    const res = await run('/shop/member/login')
    expect(rewriteOf(res)).toBeNull()
    expect(res.status).toBe(200)
  })

  it('회원 기능이 꺼진 테넌트의 회원 화면은 404 (T-115)', async () => {
    fetchMock.mockResolvedValue(templateResponse(null, 'theme', false))
    expect((await run('/shop/member/login')).status).toBe(404)
    expect((await run('/shop/member/mypage')).status).toBe(404)
    // 다른 페이지는 그대로
    expect((await run('/shop')).status).toBe(200)
  })

  it('백엔드 장애면 회원 화면도 통과 (레이아웃에서 한 번 더 확인)', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    expect((await run('/shop/member/login')).status).toBe(200)
  })

  it('소셜 공용 콜백(/member/...)은 테넌트로 보지 않는다 (T-110)', async () => {
    const res = await run('/member/social/callback?code=c&state=clinic.x')
    expect(rewriteOf(res)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('같은 테넌트는 캐시 — 백엔드를 한 번만 조회', async () => {
    fetchMock.mockResolvedValue(templateResponse('TPL_HOSPITAL_A'))
    await run('/clinic')
    await run('/clinic/about')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/public/site/clinic/template')
  })

  it('템플릿을 바꾸면 몇 초 안에 새 템플릿으로 — 오래 캐시하지 않는다 (T-125-A)', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockResolvedValueOnce(templateResponse('TPL_HOSPITAL_A'))
      expect(rewriteOf(await run('/clinic'))).toBe('http://localhost:3000/tpl-hospital-a/clinic')
      // 관리자에서 테마형으로 변경
      fetchMock.mockResolvedValueOnce(templateResponse(null))
      vi.advanceTimersByTime(CACHE_TTL_MS + 1)
      expect(rewriteOf(await run('/clinic'))).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(CACHE_TTL_MS).toBeLessThanOrEqual(5_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('테마형 · 모르는 템플릿 코드 · 조회 실패는 그대로 통과', async () => {
    fetchMock.mockResolvedValueOnce(templateResponse(null))
    expect(rewriteOf(await run('/theme-shop'))).toBeNull()
    fetchMock.mockResolvedValueOnce(templateResponse('TPL_UNKNOWN'))
    expect(rewriteOf(await run('/unknown'))).toBeNull()
    fetchMock.mockRejectedValueOnce(new Error('down'))
    expect(rewriteOf(await run('/down'))).toBeNull()
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
    expect(rewriteOf(await run('/missing'))).toBeNull()
  })

  it('미리보기 · 관리자 로그인 · 사이트맵 · 루트는 조회하지 않고 통과', async () => {
    for (const path of ['/', '/clinic/preview?tpl=TPL_HOSPITAL_A', '/clinic/login', '/clinic/sitemap.xml']) {
      expect(rewriteOf(await run(path))).toBeNull()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('내부 라우트 /tpl-* 직접 접근은 404', async () => {
    const res = await run('/tpl-hospital-a/clinic')
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('세 단계보다 깊은 주소는 분기하지 않는다', async () => {
    fetchMock.mockResolvedValue(templateResponse('TPL_HOSPITAL_A'))
    expect(rewriteOf(await run('/clinic/a/b/c'))).toBeNull()
  })
})

describe('middleware — 고객 도메인 (T-137)', () => {
  const HOST_HEADER = 'x-middleware-request-x-site-custom-host'
  const runHost = (path: string, host = 'www.oo.com', extra: Record<string, string> = {}) =>
    middleware(
      new NextRequest(new URL(path, 'http://localhost:3000'), {
        headers: { host, ...extra },
      }),
    )
  const domainResponse = (slug: string | null) =>
    slug
      ? new Response(JSON.stringify({ data: { slug } }), { status: 200 })
      : new Response('{}', { status: 404 })
  /** 도메인 조회 → 템플릿 조회 순서로 응답 */
  const mockSite = (slug: string | null, code: string | null = null) =>
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/public/domain/') ? domainResponse(slug) : templateResponse(code),
      ),
    )

  it('테마형 — 첫 화면 · 서브 경로에 slug 를 붙여 내부 전환', async () => {
    mockSite('clinic')
    expect(rewriteOf(await runHost('/'))).toBe('http://localhost:3000/clinic')
    expect(rewriteOf(await runHost('/about?x=1'))).toBe('http://localhost:3000/clinic/about?x=1')
  })

  it('코드형 — 템플릿 라우트로', async () => {
    mockSite('clinic', 'TPL_HOSPITAL_A')
    expect(rewriteOf(await runHost('/about'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/about',
    )
    expect(rewriteOf(await runHost('/member/login'))).toBe(
      'http://localhost:3000/tpl-hospital-a/clinic/member/login',
    )
  })

  describe('게시판 주소 (AC-19, T-144)', () => {
    it('코드형 — 목록 · 글 상세 · 공지가 템플릿 라우트로', async () => {
      mockSite('clinic', 'TPL_HOSPITAL_A')
      expect(rewriteOf(await runHost('/b/news?p=2'))).toBe(
        'http://localhost:3000/tpl-hospital-a/clinic/b/news?p=2',
      )
      expect(rewriteOf(await runHost('/b/news/post-1'))).toBe(
        'http://localhost:3000/tpl-hospital-a/clinic/b/news/post-1',
      )
      expect(rewriteOf(await runHost('/notice/post-1'))).toBe(
        'http://localhost:3000/tpl-hospital-a/clinic/notice/post-1',
      )
    })

    it('테마형 — 있는 게시판은 slug 를 붙여 내부 전환', async () => {
      mockSite('clinic')
      expect(rewriteOf(await runHost('/b/news'))).toBe('http://localhost:3000/clinic/b/news')
      expect(rewriteOf(await runHost('/b/news/post-1'))).toBe(
        'http://localhost:3000/clinic/b/news/post-1',
      )
    })

    it('테마형 — 없는 게시판은 공통 404 로', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('/public/domain/')
            ? domainResponse('clinic')
            : url.includes('/boards/')
              ? new Response('{}', { status: 404 })
              : templateResponse(null),
        ),
      )
      expect(rewriteOf(await runHost('/b/nope'))).toBe('http://localhost:3000/clinic/b')
    })

    it('slug 가 붙은 게시판 링크는 301 로 정식 주소에', async () => {
      mockSite('clinic')
      const res = await runHost('/clinic/b/news/post-1', 'www.oo.com', { 'x-forwarded-proto': 'https' })
      expect(res.status).toBe(301)
      expect(res.headers.get('location')).toBe('https://www.oo.com/b/news/post-1')
    })
  })

  it('확인한 도메인을 헤더로 넘기고, 방문자가 보낸 값은 버린다', async () => {
    mockSite('clinic')
    const res = await runHost('/about', 'WWW.OO.com:443', { 'x-site-custom-host': 'evil.com' })
    expect(res.headers.get(HOST_HEADER)).toBe('www.oo.com')
  })

  it('메인 주소에서 보낸 헤더도 버린다', async () => {
    fetchMock.mockResolvedValue(templateResponse(null))
    const res = await runHost('/clinic', 'localhost:3000', { 'x-site-custom-host': 'evil.com' })
    expect(res.headers.get(HOST_HEADER)).toBeNull()
  })

  it('slug 가 붙은 주소는 301 — 쿼리 유지, 접속한 도메인 · 스킴으로', async () => {
    mockSite('clinic')
    const res = await runHost('/clinic/member/login?next=%2Fabout', 'www.oo.com', {
      'x-forwarded-proto': 'https',
    })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://www.oo.com/member/login?next=%2Fabout')
    const home = await runHost('/clinic', 'www.oo.com', { 'x-forwarded-proto': 'https' })
    expect(home.headers.get('location')).toBe('https://www.oo.com/')
  })

  it('slug 로 시작만 하는 경로는 옮기지 않는다', async () => {
    mockSite('clinic')
    const res = await runHost('/clinic-news')
    expect(res.status).toBe(200)
    expect(rewriteOf(res)).toBe('http://localhost:3000/clinic/clinic-news')
  })

  it('연결되지 않은 도메인은 404, 다음 요청은 저장된 값을 쓴다', async () => {
    mockSite(null)
    expect((await runHost('/')).status).toBe(404)
    expect((await runHost('/about')).status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('백엔드 장애는 503 — 없는 도메인으로 저장하지 않는다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'))
    expect((await runHost('/')).status).toBe(503)
    mockSite('clinic')
    expect(rewriteOf(await runHost('/'))).toBe('http://localhost:3000/clinic')
  })

  it('내부 템플릿 경로는 고객 도메인에서도 404', async () => {
    mockSite('clinic')
    expect((await runHost('/tpl-hospital-a/clinic')).status).toBe(404)
  })

  it('사이트맵은 사업체 사이트맵으로', async () => {
    mockSite('clinic')
    expect(rewriteOf(await runHost('/sitemap.xml'))).toBe(
      'http://localhost:3000/clinic/sitemap.xml',
    )
  })

  it('컨테이너 이름 · IP 는 고객 도메인이 아니다', async () => {
    fetchMock.mockResolvedValue(templateResponse(null))
    await runHost('/clinic', 'client:3000')
    await runHost('/clinic', '10.0.0.5:3000')
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('/public/domain/'))).toBe(true)
  })
})

describe('middleware — 다른 게시판으로 옮긴 글 (T-184)', () => {
  const ID = '0b6c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3'
  const location = (boardSlug: string | null) =>
    boardSlug
      ? new Response(JSON.stringify({ data: { board_slug: boardSlug, is_system: false } }), {
          status: 200,
        })
      : new Response('{}', { status: 404 })
  /** 템플릿 · 글 · 글 위치 조회 응답 */
  const mockApi = (code: string | null, moved: string | null, postStatus = 404) =>
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/public/domain/')
          ? new Response(JSON.stringify({ data: { slug: 'clinic' } }), { status: 200 })
          : url.endsWith('/location')
            ? location(moved)
            : url.includes('/boards/')
              ? new Response('{}', { status: postStatus })
              : templateResponse(code),
      ),
    )
  const locationOf = (res: Response) => (res.status === 301 ? res.headers.get('location') : null)

  it('테마형 — 게시판에 없는 글이 옮겨졌으면 새 주소로 영구 이동 (쿼리 유지)', async () => {
    mockApi(null, 'jobs')
    expect(locationOf(await run(`/clinic/b/news/${ID}?from=a`))).toBe(
      `http://localhost:3000/clinic/b/jobs/${ID}?from=a`,
    )
  })

  it('공지로 옮긴 글은 /notice, 공지에서 옮긴 글은 /b/{게시판}', async () => {
    mockApi(null, 'notice')
    expect(locationOf(await run(`/clinic/b/news/${ID}`))).toBe(
      `http://localhost:3000/clinic/notice/${ID}`,
    )
    clearTemplateCache()
    mockApi(null, 'news')
    expect(locationOf(await run(`/clinic/notice/${ID}`))).toBe(
      `http://localhost:3000/clinic/b/news/${ID}`,
    )
  })

  it('테마형 — 글이 있으면 위치를 묻지 않는다', async () => {
    mockApi(null, 'jobs', 200)
    expect(rewriteOf(await run(`/clinic/b/news/${ID}`))).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/location'))).toBe(false)
  })

  it('옮긴 글이 아니면(없는 글 · 같은 게시판) 그대로 404', async () => {
    mockApi(null, null)
    expect(rewriteOf(await run(`/clinic/b/news/${ID}`))).toBe('http://localhost:3000/clinic/b')
    clearTemplateCache()
    mockApi(null, 'news')
    expect(rewriteOf(await run(`/clinic/b/news/${ID}`))).toBe('http://localhost:3000/clinic/b')
  })

  it('글 id 모양이 아니면 묻지 않는다', async () => {
    mockApi(null, 'jobs')
    await run('/clinic/b/news/p1')
    await run('/clinic/notice/write')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/location'))).toBe(false)
  })

  it('코드형 — 옮긴 글은 새 주소로, 아니면 템플릿 라우트로', async () => {
    mockApi('TPL_HOSPITAL_A', 'jobs')
    expect(locationOf(await run(`/clinic/b/news/${ID}`))).toBe(
      `http://localhost:3000/clinic/b/jobs/${ID}`,
    )
    clearTemplateCache()
    mockApi('TPL_HOSPITAL_A', 'news')
    expect(rewriteOf(await run(`/clinic/b/news/${ID}`))).toBe(
      `http://localhost:3000/tpl-hospital-a/clinic/b/news/${ID}`,
    )
  })

  it('위치 확인 실패(장애)면 그대로', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith('/location')
        ? Promise.reject(new Error('down'))
        : Promise.resolve(templateResponse('TPL_HOSPITAL_A')),
    )
    expect(rewriteOf(await run(`/clinic/b/news/${ID}`))).toBe(
      `http://localhost:3000/tpl-hospital-a/clinic/b/news/${ID}`,
    )
  })

  it('고객 도메인 — slug 없는 주소로, 접속한 스킴 · 호스트 기준', async () => {
    mockApi('TPL_HOSPITAL_A', 'jobs')
    const res = await middleware(
      new NextRequest(new URL(`/b/news/${ID}`, 'http://localhost:3000'), {
        headers: { host: 'www.oo.com', 'x-forwarded-proto': 'https' },
      }),
    )
    expect(locationOf(res)).toBe(`https://www.oo.com/b/jobs/${ID}`)
  })
})

describe('닫힌 사이트 — 404 대신 안내 화면 (T-201)', () => {
  const paused = (status: 'PAUSED' | 'ACTIVE' | null) => (url: string) =>
    Promise.resolve(
      url.includes('/template')
        ? new Response('{}', { status: 404 })
        : status
          ? new Response(JSON.stringify({ data: { status, name: '병원', phone: null } }), {
              status: 200,
            })
          : new Response('{}', { status: 404 })
    )

  it('닫힌 사이트는 어느 주소든 안내 화면으로', async () => {
    fetchMock.mockImplementation(paused('PAUSED'))
    for (const path of ['/clinic', '/clinic/about', '/clinic/b/news/p1', '/clinic/member/login']) {
      expect(rewriteOf(await run(path))).toBe('http://localhost:3000/clinic/paused')
    }
  })

  it('없는 사이트는 그대로 지나가 404 화면', async () => {
    fetchMock.mockImplementation(paused(null))
    expect(rewriteOf(await run('/nowhere'))).toBeNull()
  })

  it('열린 사이트에서 안내 화면 주소를 직접 열면 404', async () => {
    fetchMock.mockResolvedValue(templateResponse(null, 'theme'))
    expect((await run('/clinic/paused')).status).toBe(404)
  })
})
