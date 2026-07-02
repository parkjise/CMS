import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { useFeatureStore } from '@/stores/featureStore'
import { server } from './server'

const BASE = 'http://localhost:8000/api'

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

function featurePayload() {
  return {
    flags: {
      SECTION_EDITOR: true,
      NAVER_ANALYTICS: false,
      AI_CHAT_EDIT: true,
      TEMPLATE_SELECT: true,
    },
    features: [
      {
        key: 'SECTION_EDITOR',
        name: '섹션 편집기',
        menu_path: '/admin/content',
        menu_icon: 'layout',
        menu_label: '콘텐츠',
        menu_position: 10,
        is_beta: false,
        release_note: null,
        released_at: daysAgo(30),
      },
      {
        key: 'AI_CHAT_EDIT',
        name: 'AI 채팅 편집',
        menu_path: null,
        menu_icon: null,
        menu_label: null,
        menu_position: 41,
        is_beta: true,
        release_note: null,
        released_at: null,
      },
      {
        key: 'TEMPLATE_SELECT',
        name: '템플릿',
        menu_path: '/admin/templates',
        menu_icon: 'palette',
        menu_label: '템플릿',
        menu_position: 13,
        is_beta: false,
        release_note: null,
        released_at: daysAgo(2),
      },
    ],
    announcements: [
      {
        id: 'ann-1',
        title: '점검 안내',
        type: 'MAINTENANCE',
        content: '내용',
        is_read: false,
      },
    ],
  }
}

describe('featureStore', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  afterEach(() => useFeatureStore.getState().reset())

  it('load 성공 시 flags/features/announcements를 채우고 loaded=true', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: true, data: featurePayload() }),
      ),
    )

    await useFeatureStore.getState().load()

    const state = useFeatureStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.flags.SECTION_EDITOR).toBe(true)
    expect(state.features).toHaveLength(3)
    expect(state.announcements).toHaveLength(1)
  })

  it('isEnabled는 flags 기준 (없는 키는 false)', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: true, data: featurePayload() }),
      ),
    )
    await useFeatureStore.getState().load()
    const { isEnabled } = useFeatureStore.getState()
    expect(isEnabled('SECTION_EDITOR')).toBe(true)
    expect(isEnabled('NAVER_ANALYTICS')).toBe(false)
    expect(isEnabled('UNKNOWN')).toBe(false)
  })

  it('isBeta는 features의 is_beta 반영', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: true, data: featurePayload() }),
      ),
    )
    await useFeatureStore.getState().load()
    expect(useFeatureStore.getState().isBeta('AI_CHAT_EDIT')).toBe(true)
    expect(useFeatureStore.getState().isBeta('SECTION_EDITOR')).toBe(false)
  })

  it('isNew는 released_at이 7일 이내일 때만 true', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: true, data: featurePayload() }),
      ),
    )
    await useFeatureStore.getState().load()
    expect(useFeatureStore.getState().isNew('TEMPLATE_SELECT')).toBe(true) // 2일 전
    expect(useFeatureStore.getState().isNew('SECTION_EDITOR')).toBe(false) // 30일 전
  })

  it('markAnnouncementRead는 로컬 목록에서 제거', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: true, data: featurePayload() }),
      ),
    )
    await useFeatureStore.getState().load()
    await useFeatureStore.getState().markAnnouncementRead('ann-1')
    expect(useFeatureStore.getState().announcements).toHaveLength(0)
  })

  it('공지 읽음 API가 실패해도 로컬에서는 제거된다', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: true, data: featurePayload() }),
      ),
      http.post(`${BASE}/v1/announcements/:id/read`, () =>
        HttpResponse.json({ success: false }, { status: 404 }),
      ),
    )
    await useFeatureStore.getState().load()
    await useFeatureStore.getState().markAnnouncementRead('ann-1')
    expect(useFeatureStore.getState().announcements).toHaveLength(0)
  })

  it('load 실패 시 loaded=false 유지 (graceful degradation)', async () => {
    server.use(
      http.get(`${BASE}/v1/tenant/features`, () =>
        HttpResponse.json({ success: false }, { status: 500 }),
      ),
    )
    await useFeatureStore.getState().load()
    expect(useFeatureStore.getState().loaded).toBe(false)
  })
})
