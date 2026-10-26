import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { clearTemplateCache, middleware } from '@/middleware'

/** 미들웨어 — 코드형 템플릿 라우트 분기 (T-125, 오픈 이슈 #26) */
const fetchMock = vi.fn()

const templateResponse = (code: string | null, renderer = code ? 'code' : 'theme') =>
  new Response(JSON.stringify({ success: true, data: { code, renderer } }), { status: 200 })

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
