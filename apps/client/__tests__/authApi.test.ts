import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { authApi, getAccessToken, refreshAccessToken, setAccessToken } from '@/lib/api'
import { useClientAuthStore } from '@/lib/authStore'

/**
 * 홈페이지 인증 API — Access Token 을 붙이고 401 이면 쿠키로 갱신 후 재시도 (T-064-A).
 * 이전에는 토큰을 버려 편집 모드 저장 · 업로드 · AI 가 실제 서버에서 모두 401 이었다.
 */

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown }

const calls: Array<{ url?: string; auth?: string }> = []

const useAdapter = (handler: Handler) => {
  authApi.defaults.adapter = async (config) => {
    calls.push({ url: config.url, auth: config.headers.Authorization as string | undefined })
    const { status, data } = handler(config)
    const response = { status, data, statusText: '', headers: {}, config }
    if (status >= 400) {
      throw new AxiosError('fail', String(status), config, null, response)
    }
    return response
  }
}

const refreshOk = (token: string) =>
  vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { access_token: token } } })

const unauthorized = (config: InternalAxiosRequestConfig) =>
  config.headers.Authorization === 'Bearer fresh'
    ? { status: 200, data: { success: true, data: { ok: true } } }
    : { status: 401, data: { success: false } }

beforeEach(() => {
  calls.length = 0
  setAccessToken(null)
})
afterEach(() => vi.restoreAllMocks())

describe('authApi 토큰 처리', () => {
  it('보관한 Access Token 을 Authorization 헤더로 붙인다', async () => {
    setAccessToken('tok-1')
    useAdapter(() => ({ status: 200, data: {} }))
    await authApi.post('/edit/batch-save', { changes: [] })
    expect(calls[0].auth).toBe('Bearer tok-1')
  })

  it('401 이면 쿠키로 갱신하고 새 토큰으로 한 번 재시도한다', async () => {
    const refresh = refreshOk('fresh')
    useAdapter(unauthorized)
    const res = await authApi.post('/upload/image', {})
    expect(res.status).toBe(200)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh.mock.calls[0][0]).toMatch(/\/v1\/auth\/refresh$/)
    expect(calls.map((c) => c.auth)).toEqual([undefined, 'Bearer fresh'])
    expect(getAccessToken()).toBe('fresh')
  })

  it('동시에 401 이 나도 갱신은 한 번만 한다 (Refresh Token 회전)', async () => {
    const refresh = refreshOk('fresh')
    useAdapter(unauthorized)
    await Promise.all([authApi.get('/auth/me'), authApi.post('/edit/batch-save', {})])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('갱신도 실패하면 원래 401 을 그대로 돌려주고 토큰을 지운다', async () => {
    setAccessToken('old')
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'))
    useAdapter(() => ({ status: 401, data: {} }))
    await expect(authApi.get('/auth/me')).rejects.toMatchObject({ response: { status: 401 } })
    expect(getAccessToken()).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('로그인 요청의 401 은 갱신하지 않는다', async () => {
    const refresh = refreshOk('fresh')
    useAdapter(() => ({ status: 401, data: {} }))
    await expect(authApi.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshAccessToken 은 진행 중인 갱신을 함께 쓴다', async () => {
    const refresh = refreshOk('shared')
    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()])
    expect(a).toBe('shared')
    expect(b).toBe('shared')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('authStore 토큰 보관', () => {
  it('로그인하면 응답의 access_token 을 보관하고, 로그아웃하면 지운다', async () => {
    useAdapter((config) =>
      config.url === '/auth/login'
        ? {
            status: 200,
            data: { data: { access_token: 'login-tok', user: { id: 'u1', email: 'a@b.c' } } },
          }
        : { status: 204, data: null },
    )
    await useClientAuthStore.getState().login('a@b.c', 'pw', 'test-tenant')
    expect(getAccessToken()).toBe('login-tok')
    expect(useClientAuthStore.getState().isLoggedIn).toBe(true)

    await useClientAuthStore.getState().logout()
    expect(getAccessToken()).toBeNull()
    expect(useClientAuthStore.getState().isLoggedIn).toBe(false)
  })

  it('새로고침 후 initialize 는 쿠키로 토큰을 받아 로그인 상태를 되살린다', async () => {
    refreshOk('fresh')
    useAdapter((config) =>
      config.headers.Authorization === 'Bearer fresh'
        ? { status: 200, data: { data: { id: 'u1', email: 'a@b.c' } } }
        : { status: 401, data: {} },
    )
    await useClientAuthStore.getState().initialize()
    expect(useClientAuthStore.getState().isLoggedIn).toBe(true)
  })
})
