import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditStore } from '@/lib/editStore'
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
  })
  window.localStorage.clear()
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
})
