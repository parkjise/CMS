import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { tokenSubject, useAuthStore } from '@/stores/authStore'
import { server } from './server'

const BASE = 'http://localhost:8000/api'

function reset() {
  useAuthStore.setState({
    accessToken: null,
    user: null,
    tenantSlug: null,
    isAuthenticated: false,
    isInitializing: false,
    initialized: false,
  })
}

describe('authStore', () => {
  beforeEach(() => reset())
  afterEach(() => reset())

  it('login 성공 시 user/accessToken/tenantSlug 저장 + isAuthenticated=true', async () => {
    await useAuthStore
      .getState()
      .login('admin@example.com', 'correct', 'test-slug')

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('access-token-fake')
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.email).toBe('admin@example.com')
    expect(state.tenantSlug).toBe('test-slug')
  })

  it('login 실패 시 에러를 throw하고 상태 미변경', async () => {
    await expect(
      useAuthStore.getState().login('admin@example.com', 'wrong', 'test-slug')
    ).rejects.toThrow()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('initialize 성공 시 refresh + /me로 상태 채움', async () => {
    await useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.isAuthenticated).toBe(true)
    expect(state.accessToken).toBe('access-token-refreshed')
    expect(state.user?.email).toBe('me@example.com')
  })

  it('initialize 실패 시 비인증 상태 + initialized=true', async () => {
    // refresh를 401로 응답
    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: '만료' } },
          { status: 401 }
        )
      )
    )

    await useAuthStore.getState().initialize()

    const state = useAuthStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.isAuthenticated).toBe(false)
    expect(state.accessToken).toBeNull()
  })

  describe('저장된 사용자로 바로 열기 (T-043-A)', () => {
    const jwt = (sub: string) =>
      `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`
    const cachedUser = { id: 'u-1', email: 'cached@example.com' } as never

    const useToken = (token: string) =>
      server.use(
        http.post(`${BASE}/v1/auth/refresh`, () =>
          HttpResponse.json({ success: true, data: { access_token: token } }),
        ),
      )

    it('tokenSubject 는 토큰의 sub 를 읽고, 이상한 값이면 null', () => {
      expect(tokenSubject(jwt('u-1'))).toBe('u-1')
      expect(tokenSubject('not-a-jwt')).toBeNull()
    })

    it('같은 사람이면 /me 를 기다리지 않고 열고, /me 결과로 나중에 갱신', async () => {
      let releaseMe: () => void = () => {}
      const meGate = new Promise<void>((r) => {
        releaseMe = r
      })
      useToken(jwt('u-1'))
      server.use(
        http.get(`${BASE}/v1/auth/me`, async () => {
          await meGate
          return HttpResponse.json({ success: true, data: { id: 'u-1', email: 'fresh@example.com' } })
        }),
      )
      useAuthStore.setState({ user: cachedUser })

      await useAuthStore.getState().initialize()
      let state = useAuthStore.getState()
      expect(state.initialized).toBe(true)
      expect(state.isAuthenticated).toBe(true)
      expect(state.user?.email).toBe('cached@example.com')

      releaseMe()
      await waitFor(() => expect(useAuthStore.getState().user?.email).toBe('fresh@example.com'))
      state = useAuthStore.getState()
      expect(state.accessToken).toBe(jwt('u-1'))
    })

    it('다른 사람이면 예전처럼 /me 를 기다려 그 사용자로 채운다', async () => {
      useToken(jwt('u-2'))
      useAuthStore.setState({ user: cachedUser })
      await useAuthStore.getState().initialize()
      expect(useAuthStore.getState().user?.email).toBe('me@example.com')
    })
  })

  describe('refresh 응답의 내 정보 (T-043-B)', () => {
    it('refresh 가 user 를 주면 /me 를 부르지 않는다 (저장된 사용자가 있어도)', async () => {
      let meCalls = 0
      server.use(
        http.post(`${BASE}/v1/auth/refresh`, () =>
          HttpResponse.json({
            success: true,
            data: { access_token: 'tok-with-user', user: { id: 'u-9', email: 'refresh@example.com' } },
          }),
        ),
        http.get(`${BASE}/v1/auth/me`, () => {
          meCalls += 1
          return HttpResponse.json({ success: true, data: { id: 'u-9', email: 'me@example.com' } })
        }),
      )
      useAuthStore.setState({ user: { id: 'u-9', email: 'cached@example.com' } as never })

      await useAuthStore.getState().initialize()
      await new Promise((r) => setTimeout(r, 20)) // 뒤에서 /me 를 부르지 않는지까지

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.accessToken).toBe('tok-with-user')
      expect(state.user?.email).toBe('refresh@example.com')
      expect(meCalls).toBe(0)
    })

    it('user 가 없는 응답(예전 서버)이면 /me 로 채운다', async () => {
      server.use(
        http.post(`${BASE}/v1/auth/refresh`, () =>
          HttpResponse.json({ success: true, data: { access_token: 'tok-old', user: null } }),
        ),
      )
      await useAuthStore.getState().initialize()
      expect(useAuthStore.getState().user?.email).toBe('me@example.com')
    })
  })

  describe('index.html 이 미리 보낸 refresh (T-043-B)', () => {
    afterEach(() => {
      window.__cmsRefresh = undefined
    })

    const countRefresh = () => {
      const calls = { n: 0 }
      server.use(
        http.post(`${BASE}/v1/auth/refresh`, () => {
          calls.n += 1
          return HttpResponse.json({ success: true, data: { access_token: 'tok-network' } })
        }),
      )
      return calls
    }

    it('미리 받은 결과를 쓰고 refresh 를 다시 부르지 않는다 (한 번만 꺼냄)', async () => {
      const calls = countRefresh()
      window.__cmsRefresh = Promise.resolve({
        status: 200,
        body: { data: { access_token: 'tok-prefetched', user: { id: 'u-1', email: 'pre@example.com' } as never } },
      })
      await useAuthStore.getState().initialize()
      const state = useAuthStore.getState()
      expect(state.accessToken).toBe('tok-prefetched')
      expect(state.user?.email).toBe('pre@example.com')
      expect(calls.n).toBe(0)
      expect(window.__cmsRefresh).toBeUndefined()
    })

    it('미리 받은 결과가 401 이면 같은 쿠키로 다시 부르지 않고 로그인 화면으로', async () => {
      const calls = countRefresh()
      window.__cmsRefresh = Promise.resolve({ status: 401, body: { data: { access_token: '' } } })
      await useAuthStore.getState().initialize()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(calls.n).toBe(0)
    })

    it('연결 오류(null)면 직접 refresh 를 부른다', async () => {
      const calls = countRefresh()
      window.__cmsRefresh = Promise.resolve(null)
      await useAuthStore.getState().initialize()
      expect(useAuthStore.getState().accessToken).toBe('tok-network')
      expect(calls.n).toBe(1)
    })
  })

  it('initialize 를 동시에 두 번 불러도 refresh 는 한 번 (T-043-B — 개발 모드 StrictMode)', async () => {
    let calls = 0
    server.use(
      http.post(`${BASE}/v1/auth/refresh`, () => {
        calls += 1
        return HttpResponse.json({
          success: true,
          data: { access_token: 'tok-once', user: { id: 'u-1', email: 'once@example.com' } },
        })
      }),
    )
    const { initialize } = useAuthStore.getState()
    await Promise.all([initialize(), initialize()])
    expect(calls).toBe(1)
    expect(useAuthStore.getState().accessToken).toBe('tok-once')
  })

  it('initialize는 두 번 호출해도 한 번만 실행', async () => {
    await useAuthStore.getState().initialize()
    const firstToken = useAuthStore.getState().accessToken

    // 두 번째 호출은 즉시 return
    await useAuthStore.getState().initialize()
    expect(useAuthStore.getState().accessToken).toBe(firstToken)
  })

  it('updateToken은 accessToken만 갱신', () => {
    useAuthStore.setState({ accessToken: 'old' })
    useAuthStore.getState().updateToken('new')
    expect(useAuthStore.getState().accessToken).toBe('new')
  })

  it('clearAuth는 모든 인증 상태 초기화', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      user: { id: 'u' } as never,
      tenantSlug: 't',
      isAuthenticated: true,
      initialized: true,
    })
    useAuthStore.getState().clearAuth()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
    expect(state.tenantSlug).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.initialized).toBe(false)
  })

  it('logout은 서버 호출 후 상태 초기화', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      isAuthenticated: true,
      user: { email: 'me@x.com' } as never,
    })

    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
