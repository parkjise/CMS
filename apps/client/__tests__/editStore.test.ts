import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EDIT_MODE_SESSION_KEY, useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'
import { authApi } from '@/lib/api'

const resetStores = () => {
  useEditStore.setState({
    isEditMode: false,
    pendingChanges: {},
    isDirty: false,
  })
  useClientAuthStore.setState({
    user: null,
    isLoggedIn: false,
    isInitialized: false,
  })
  window.localStorage.clear()
  window.sessionStorage.clear()
}

describe('editStore', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('toggleEditMode', () => {
    it('비로그인 상태에서는 토글되지 않는다', () => {
      useEditStore.getState().toggleEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
    })

    it('로그인 상태에서 토글된다', () => {
      useClientAuthStore.setState({ isLoggedIn: true })
      useEditStore.getState().toggleEditMode()
      expect(useEditStore.getState().isEditMode).toBe(true)
      useEditStore.getState().toggleEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
    })
  })

  describe('updateField', () => {
    it('변경사항을 pendingChanges에 추가하고 isDirty=true', () => {
      useEditStore
        .getState()
        .updateField('sec-1', 'main_title', '새 타이틀', '기존 타이틀')
      const state = useEditStore.getState()
      expect(state.isDirty).toBe(true)
      expect(state.pendingChanges['sec-1:main_title']).toMatchObject({
        section_id: 'sec-1',
        field: 'main_title',
        original_value: '기존 타이틀',
        new_value: '새 타이틀',
      })
    })

    it('같은 section+field 두 번 수정 시 마지막 값만 유지', () => {
      const store = useEditStore.getState()
      store.updateField('sec-1', 'main_title', 'v1', 'orig')
      store.updateField('sec-1', 'main_title', 'v2', 'orig')
      expect(
        useEditStore.getState().pendingChanges['sec-1:main_title'].new_value,
      ).toBe('v2')
      expect(
        Object.keys(useEditStore.getState().pendingChanges).length,
      ).toBe(1)
    })
  })

  describe('discardAll', () => {
    it('pendingChanges 초기화 + isDirty=false', () => {
      const store = useEditStore.getState()
      store.updateField('sec-1', 'main_title', 'v1', 'orig')
      expect(useEditStore.getState().isDirty).toBe(true)
      store.discardAll()
      const state = useEditStore.getState()
      expect(state.isDirty).toBe(false)
      expect(state.pendingChanges).toEqual({})
    })
  })

  describe('saveAll', () => {
    it('변경사항 없으면 0 카운트 반환 + API 호출 없음', async () => {
      const spy = vi.spyOn(authApi, 'post')
      const result = await useEditStore.getState().saveAll()
      expect(result).toEqual({
        saved_count: 0,
        failed_count: 0,
        cache_purged: false,
      })
      expect(spy).not.toHaveBeenCalled()
    })

    it('changes 페이로드를 올바른 형식으로 백엔드에 전송하고 결과 반환', async () => {
      const spy = vi
        .spyOn(authApi, 'post')
        .mockResolvedValue({
          data: {
            success: true,
            data: { saved_count: 2, failed_count: 0, cache_purged: true },
          },
        })

      const store = useEditStore.getState()
      store.updateField('sec-1', 'main_title', 'v1', 'orig')
      store.updateField('sec-2', 'intro_text', 'v2', 'orig')

      const result = await useEditStore.getState().saveAll()

      expect(spy).toHaveBeenCalledWith('/edit/batch-save', {
        changes: expect.arrayContaining([
          expect.objectContaining({
            section_id: 'sec-1',
            field: 'main_title',
            value: 'v1',
          }),
          expect.objectContaining({
            section_id: 'sec-2',
            field: 'intro_text',
            value: 'v2',
          }),
        ]),
      })
      expect(result.saved_count).toBe(2)
      expect(useEditStore.getState().isDirty).toBe(false)
      expect(useEditStore.getState().pendingChanges).toEqual({})
    })

    it('서식 글은 format: rich 로, 일반 글자는 format 없이 보낸다 (T-065-A)', async () => {
      const spy = vi.spyOn(authApi, 'post').mockResolvedValue({
        data: { success: true, data: { saved_count: 2, failed_count: 0, cache_purged: true } },
      })
      const store = useEditStore.getState()
      store.updateField('sec-1', 'main_title', '<b>v1</b>', 'orig', 'rich')
      store.updateField('sec-2', 'intro_text', 'v2', '<b>orig</b>', 'plain')

      await useEditStore.getState().saveAll()

      const body = spy.mock.calls[0][1] as { changes: Array<Record<string, string>> }
      expect(body.changes).toContainEqual({
        section_id: 'sec-1',
        field: 'main_title',
        value: '<b>v1</b>',
        format: 'rich',
      })
      expect(body.changes).toContainEqual({ section_id: 'sec-2', field: 'intro_text', value: 'v2' })
    })

    it('일부 실패 시 pendingChanges는 보존된다', async () => {
      vi.spyOn(authApi, 'post').mockResolvedValue({
        data: {
          success: true,
          data: { saved_count: 1, failed_count: 1, cache_purged: false },
        },
      })

      const store = useEditStore.getState()
      store.updateField('sec-1', 'main_title', 'v1', 'orig')
      store.updateField('sec-2', 'intro_text', 'v2', 'orig')

      const result = await useEditStore.getState().saveAll()
      expect(result.failed_count).toBe(1)
      expect(useEditStore.getState().isDirty).toBe(true)
      expect(
        Object.keys(useEditStore.getState().pendingChanges).length,
      ).toBe(2)
    })
  })

  describe('AI 패널 토글', () => {
    it('toggleAiPanel은 isAiPanelOpen을 반전한다', () => {
      expect(useEditStore.getState().isAiPanelOpen).toBe(false)
      useEditStore.getState().toggleAiPanel()
      expect(useEditStore.getState().isAiPanelOpen).toBe(true)
      useEditStore.getState().toggleAiPanel()
      expect(useEditStore.getState().isAiPanelOpen).toBe(false)
    })

    it('편집 종료 시 AI 패널도 닫힌다', () => {
      useEditStore.setState({ isEditMode: true, isAiPanelOpen: true })
      useEditStore.getState().exitEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
      expect(useEditStore.getState().isAiPanelOpen).toBe(false)
    })
  })

  describe('hasPersistedDraft', () => {
    it('pendingChanges 없으면 false', () => {
      expect(useEditStore.getState().hasPersistedDraft()).toBe(false)
    })
    it('있으면 true', () => {
      useEditStore.getState().updateField('sec-1', 'f', 'v', 'o')
      expect(useEditStore.getState().hasPersistedDraft()).toBe(true)
    })
  })

  describe('페이지를 옮겨도 편집 모드 유지 (T-125-D)', () => {
    const remembered = () => window.sessionStorage.getItem(EDIT_MODE_SESSION_KEY)
    const loggedIn = () => useClientAuthStore.setState({ isLoggedIn: true, isInitialized: true })

    it('켜면 탭에 기억하고, 끄면(편집 종료 · 토글) 지운다', () => {
      loggedIn()
      useEditStore.getState().enterEditMode()
      expect(remembered()).toBe('1')
      useEditStore.getState().exitEditMode()
      expect(remembered()).toBeNull()
      useEditStore.getState().toggleEditMode()
      expect(remembered()).toBe('1')
      useEditStore.getState().toggleEditMode()
      expect(remembered()).toBeNull()
    })

    it('새 페이지에서 로그인 확인이 끝나면 다시 켠다 · 미리보기는 풀린 채로', () => {
      window.sessionStorage.setItem(EDIT_MODE_SESSION_KEY, '1')
      useEditStore.setState({ isPreview: true })
      loggedIn()
      useEditStore.getState().restoreEditMode()
      expect(useEditStore.getState().isEditMode).toBe(true)
      expect(useEditStore.getState().isPreview).toBe(false)
    })

    it('로그인 확인 전에는 판단하지 않는다 (기억도 그대로)', () => {
      window.sessionStorage.setItem(EDIT_MODE_SESSION_KEY, '1')
      useEditStore.getState().restoreEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
      expect(remembered()).toBe('1')
    })

    it('로그아웃 · 만료면 켜지 않고 기억을 지운다', () => {
      window.sessionStorage.setItem(EDIT_MODE_SESSION_KEY, '1')
      useClientAuthStore.setState({ isLoggedIn: false, isInitialized: true })
      useEditStore.getState().restoreEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
      expect(remembered()).toBeNull()
    })

    it('기억이 없으면 로그인해 있어도 켜지 않는다', () => {
      loggedIn()
      useEditStore.getState().restoreEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
    })

    it('저장소를 못 쓰는 환경에서도 편집 모드 켜기 · 끄기는 된다', () => {
      loggedIn()
      vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
        throw new Error('blocked')
      })
      useEditStore.getState().enterEditMode()
      expect(useEditStore.getState().isEditMode).toBe(true)
      useEditStore.getState().restoreEditMode()
      useEditStore.getState().exitEditMode()
      expect(useEditStore.getState().isEditMode).toBe(false)
    })
  })
})

// 보기 전용 계정은 편집 모드에 들어갈 수 없다 (T-130)
describe('보기 전용 계정', () => {
  const viewer = { role: 'TENANT_VIEWER' } as never

  beforeEach(() => {
    useEditStore.setState({ isEditMode: false })
    useClientAuthStore.setState({ user: viewer, isLoggedIn: true, isInitialized: true })
  })

  it('켜기 · 토글이 동작하지 않는다', () => {
    useEditStore.getState().enterEditMode()
    useEditStore.getState().toggleEditMode()
    expect(useEditStore.getState().isEditMode).toBe(false)
  })

  it('탭에 기억된 편집 모드를 되살리지 않고 지운다', () => {
    sessionStorage.setItem(EDIT_MODE_SESSION_KEY, '1')
    useEditStore.getState().restoreEditMode()
    expect(useEditStore.getState().isEditMode).toBe(false)
    expect(sessionStorage.getItem(EDIT_MODE_SESSION_KEY)).toBeNull()
  })
})
