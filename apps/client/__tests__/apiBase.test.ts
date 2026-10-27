import { afterEach, describe, expect, it, vi } from 'vitest'

/** API 기본 주소 — 서버는 API_INTERNAL_URL 우선, 브라우저는 공개 주소 (운영 배포 B1) */
const load = async () => {
  vi.resetModules()
  return import('@/lib/apiBase')
}

/** 서버(SSR · 미들웨어) 흉내 — window 없음 */
const asServer = () => vi.stubGlobal('window', undefined)

describe('serverApiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('서버에서 API_INTERNAL_URL 이 있으면 내부 주소', async () => {
    asServer()
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://cms.kr/api')
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:8000/api')
    const { serverApiBase } = await load()
    expect(serverApiBase()).toBe('http://backend:8000/api')
  })

  it('실행 중에 바뀐 값도 반영 (호출할 때 읽음)', async () => {
    asServer()
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://cms.kr/api')
    const { serverApiBase } = await load()
    expect(serverApiBase()).toBe('https://cms.kr/api')
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:8000/api')
    expect(serverApiBase()).toBe('http://backend:8000/api')
  })

  it('내부 주소가 없으면 공개 주소, 둘 다 없으면 localhost', async () => {
    asServer()
    vi.stubEnv('API_INTERNAL_URL', '')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://cms.kr/api')
    expect((await load()).serverApiBase()).toBe('https://cms.kr/api')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', undefined as unknown as string)
    expect((await load()).serverApiBase()).toBe('http://localhost:8000/api')
  })

  it('브라우저에서는 내부 주소를 쓰지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://cms.kr/api')
    vi.stubEnv('API_INTERNAL_URL', 'http://backend:8000/api')
    const { serverApiBase } = await load() // jsdom — window 있음
    expect(serverApiBase()).toBe('https://cms.kr/api')
  })
})
