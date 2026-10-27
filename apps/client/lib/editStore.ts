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
        set((s) => ({ isEditMode: !s.isEditMode, isPreview: false }))
      },
      enterEditMode: () => {
        const { isLoggedIn } = useClientAuthStore.getState()
        if (!isLoggedIn) return
        set({ isEditMode: true })
      },
      exitEditMode: () => set({ isEditMode: false, isAiPanelOpen: false, isPreview: false }),
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
