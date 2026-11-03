'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from './api'
import { useClientAuthStore } from './authStore'

export interface PendingChange {
  section_id: string
  field: string
  original_value: string
  new_value: string
  changed_at: string
  /** 'rich' = 미니 툴바 서식 HTML (T-065-A). 없으면 일반 글자 */
  format?: TextFormat
}

export type TextFormat = 'plain' | 'rich'

export interface SaveResult {
  saved_count: number
  failed_count: number
  cache_purged: boolean
}

interface EditStore {
  isEditMode: boolean
  pendingChanges: Record<string, PendingChange>
  isDirty: boolean
  isAiPanelOpen: boolean
  /** 미리보기 — 편집 표시를 숨기고 저장 전 내용을 방문자 화면처럼 (기획서 12.2, T-065-B) */
  isPreview: boolean

  toggleEditMode: () => void
  enterEditMode: () => void
  /** 같은 탭에서 켜 두었던 편집 모드를 페이지 이동 뒤 다시 켠다 — 로그인 확인 뒤에 부른다 (T-125-D) */
  restoreEditMode: () => void
  exitEditMode: () => void
  toggleAiPanel: () => void
  setAiPanelOpen: (open: boolean) => void
  setPreview: (preview: boolean) => void
  updateField: (
    sectionId: string,
    field: string,
    newValue: string,
    originalValue: string,
    format?: TextFormat,
  ) => void
  saveAll: () => Promise<SaveResult>
  discardAll: () => void
  hasPersistedDraft: () => boolean
}

const buildKey = (sectionId: string, field: string) => `${sectionId}:${field}`

/**
 * 편집 모드 켜짐을 탭에 기억 (T-125-D) — 코드형 템플릿 메뉴는 일반 링크라 페이지를 옮기면
 * 메모리 상태가 사라진다. 같은 탭에서만 유지(sessionStorage), 탭을 닫으면 끝.
 * 첫 렌더에는 쓰지 않는다 — 로그인 확인 뒤 restoreEditMode() 로 켠다 (hydration 일치)
 */
export const EDIT_MODE_SESSION_KEY = 'cms-edit-mode'

const rememberEditMode = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(EDIT_MODE_SESSION_KEY, '1')
    else sessionStorage.removeItem(EDIT_MODE_SESSION_KEY)
  } catch {
    // 저장소를 못 쓰면(사생활 보호 모드 등) 페이지를 옮길 때 편집 모드가 풀릴 뿐
  }
}

const rememberedEditMode = (): boolean => {
  try {
    return sessionStorage.getItem(EDIT_MODE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export const useEditStore = create<EditStore>()(
  persist(
    (set, get) => ({
      isEditMode: false,
      pendingChanges: {},
      isDirty: false,
      isAiPanelOpen: false,
      isPreview: false,

      toggleEditMode: () => {
        const { isLoggedIn } = useClientAuthStore.getState()
        if (!isLoggedIn) return
        const next = !get().isEditMode
        rememberEditMode(next)
        set({ isEditMode: next, isPreview: false })
      },
      enterEditMode: () => {
        const { isLoggedIn } = useClientAuthStore.getState()
        if (!isLoggedIn) return
        rememberEditMode(true)
        set({ isEditMode: true })
      },
      exitEditMode: () => {
        rememberEditMode(false)
        set({ isEditMode: false, isAiPanelOpen: false, isPreview: false })
      },
      restoreEditMode: () => {
        if (!rememberedEditMode()) return
        const { isInitialized, isLoggedIn } = useClientAuthStore.getState()
        if (!isInitialized) return
        if (!isLoggedIn) {
          // 로그아웃 · 만료 — 기억을 지운다
          rememberEditMode(false)
          return
        }
        set({ isEditMode: true, isPreview: false })
      },
      toggleAiPanel: () => set((s) => ({ isAiPanelOpen: !s.isAiPanelOpen })),
      setAiPanelOpen: (open: boolean) => set({ isAiPanelOpen: open }),
      setPreview: (preview: boolean) =>
        set((s) => ({
          isPreview: s.isEditMode && preview,
          // 미리보기 동안 AI 패널도 닫는다
          isAiPanelOpen: preview ? false : s.isAiPanelOpen,
        })),

      updateField: (sectionId, field, newValue, originalValue, format) => {
        set((state) => ({
          pendingChanges: {
            ...state.pendingChanges,
            [buildKey(sectionId, field)]: {
              section_id: sectionId,
              field,
              original_value: originalValue,
              new_value: newValue,
              changed_at: new Date().toISOString(),
              ...(format === 'rich' ? { format } : {}),
            },
          },
          isDirty: true,
        }))
      },

      saveAll: async () => {
        const { pendingChanges } = get()
        const changes = Object.values(pendingChanges).map((c) => ({
          section_id: c.section_id,
          field: c.field,
          value: c.new_value,
          ...(c.format === 'rich' ? { format: 'rich' as const } : {}),
        }))

        if (changes.length === 0) {
          return { saved_count: 0, failed_count: 0, cache_purged: false }
        }

        const { data } = await authApi.post('/edit/batch-save', { changes })
        const result = data.data as SaveResult
        if (result.failed_count === 0) {
          set({ pendingChanges: {}, isDirty: false })
        }
        return result
      },

      discardAll: () => set({ pendingChanges: {}, isDirty: false }),

      hasPersistedDraft: () => Object.keys(get().pendingChanges).length > 0,
    }),
    {
      name: 'cms-edit-draft',
      partialize: (state) => ({
        pendingChanges: state.pendingChanges,
        isDirty: state.isDirty,
      }),
    },
  ),
)

/** 편집 UI(테두리 · 컨트롤 · 팝업)를 보여 줄 때 — 편집 모드이면서 미리보기가 아닐 때 */
export const selectEditingUi = (s: Pick<EditStore, 'isEditMode' | 'isPreview'>) =>
  s.isEditMode && !s.isPreview
