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
