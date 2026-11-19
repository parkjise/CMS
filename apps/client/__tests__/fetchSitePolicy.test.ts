import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSitePolicy } from '@/lib/fetchSitePolicy'

// 약관 · 방침 버전 읽기 (T-224)

const json = (data: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve({ data }) } as Response)

const current = {
  kind: 'terms',
  title: '이용약관',
  body: '지금 약관',
  is_default: false,
  updated_at: '2026-12-01T00:00:00Z',
  version: 2,
  effective_at: '2026-12-01T00:00:00Z',
  history: [{ version: 1, effective_at: '2026-11-01T00:00:00Z' }],
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchSitePolicy', () => {
  it('버전이 없으면 지금 문서', async () => {
    const fetch = vi.fn(() => json(current))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchSitePolicy('demo', 'terms')).toEqual(current)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('이전 버전 — 본문은 그 버전, 이전 버전 목록은 지금 문서에서', async () => {
    const fetch = vi.fn((url: string) =>
      url.endsWith('/versions/1')
        ? json({
            kind: 'terms',
            title: '이용약관',
            body: '옛 약관',
            version: 1,
            status: 'archived',
            effective_at: '2026-11-01T00:00:00Z',
          })
        : json(current)
    )
    vi.stubGlobal('fetch', fetch)
    const old = await fetchSitePolicy('demo', 'terms', 1)
    expect(old).toMatchObject({
      body: '옛 약관',
      version: 1,
      archived: true,
      history: current.history,
    })
    expect(fetch.mock.calls[1][0]).toContain('/public/site/demo/policies/terms/versions/1')
  })

  it('지금 버전 번호면 한 번만 읽는다 · 없는 버전은 null', async () => {
    const fetch = vi.fn((url: string) =>
      url.includes('/versions/') ? json(null, false) : json(current)
    )
    vi.stubGlobal('fetch', fetch)
    expect((await fetchSitePolicy('demo', 'terms', 2))?.body).toBe('지금 약관')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await fetchSitePolicy('demo', 'terms', 9)).toBeNull()
  })
})
