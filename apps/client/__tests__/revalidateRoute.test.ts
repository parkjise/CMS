import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 홈페이지 캐시 비우기 엔드포인트 (T-066-A) */

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidateTag }))

import { POST } from '@/app/api/revalidate/route'

const SECRET = 's'.repeat(32)

const call = (body: unknown, secret: string | null = SECRET) =>
  POST(
    new Request('http://client:3000/api/revalidate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret === null ? {} : { 'x-revalidate-secret': secret }),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

beforeEach(() => {
  revalidateTag.mockClear()
  vi.stubEnv('REVALIDATE_SECRET', SECRET)
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/revalidate', () => {
  it('비밀 키가 맞으면 슬러그마다 site:{slug} 태그를 비운다', async () => {
    const res = await call({ slugs: ['test-tenant', 'clinic-1'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revalidated: true, count: 2 })
    expect(revalidateTag.mock.calls).toEqual([['site:test-tenant'], ['site:clinic-1']])
  })

  it.each([
    ['비밀 키 없음', null],
    ['비밀 키 틀림', 'wrong'],
    ['길이만 같은 틀린 키', 'x'.repeat(32)],
  ])('%s → 401, 캐시 그대로', async (_label, secret) => {
    const res = await call({ slugs: ['test-tenant'] }, secret)
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('서버에 비밀 키가 설정되지 않았으면 503 (기능 꺼짐)', async () => {
    vi.stubEnv('REVALIDATE_SECRET', '')
    const res = await call({ slugs: ['test-tenant'] })
    expect(res.status).toBe(503)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON 아님', 'not json'],
    ['slugs 없음', {}],
    ['빈 목록', { slugs: [] }],
    ['문자열 아님', { slugs: [1] }],
    ['허용 안 되는 문자', { slugs: ['../etc'] }],
    ['대문자', { slugs: ['Test'] }],
  ])('%s → 400', async (_label, body) => {
    const res = await call(body)
    expect(res.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
