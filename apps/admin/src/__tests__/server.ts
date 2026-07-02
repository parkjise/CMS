import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost:8000/api'

/** 테스트별 핸들러 재정의를 위해 server.use(...)로 추가한다. */
export const server = setupServer(
  // 기본 핸들러: 인증 흐름
  http.post(`${BASE}/v1/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.password !== 'correct') {
      return HttpResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인 실패' } },
        { status: 401 }
      )
    }
    return HttpResponse.json({
      success: true,
      data: {
        access_token: 'access-token-fake',
        token_type: 'bearer',
        user: {
          id: 'u-1',
          tenant_id: 't-1',
          email: body.email,
          role: 'TENANT_ADMIN',
          last_login_at: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      },
    })
  }),

  http.post(`${BASE}/v1/auth/logout`, () => HttpResponse.json({ success: true })),

  http.post(`${BASE}/v1/auth/refresh`, () =>
    HttpResponse.json({
      success: true,
      data: { access_token: 'access-token-refreshed', token_type: 'bearer' },
    })
  ),

  http.get(`${BASE}/v1/auth/me`, () =>
    HttpResponse.json({
      success: true,
      data: {
        id: 'u-1',
        tenant_id: 't-1',
        email: 'me@example.com',
        role: 'TENANT_ADMIN',
        last_login_at: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
  ),

  // 기능 플래그 (T-086 백엔드 스펙)
  http.get(`${BASE}/v1/tenant/features`, () =>
    HttpResponse.json({
      success: true,
      data: { flags: {}, features: [], announcements: [] },
    })
  ),

  http.post(`${BASE}/v1/announcements/:id/read`, () =>
    HttpResponse.json({ success: true, data: { read: true } })
  )
)
