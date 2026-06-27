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
}

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

  toggleEditMode: () => void
  enterEditMode: () => void
  exitEditMode: () => void
  toggleAiPanel: () => void
  setAiPanelOpen: (open: boolean) => void
  updateField: (
    sectionId: string,
    field: string,
    newValue: string,
    originalValue: string,
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

      toggleEditMode: () => {
        const { isLoggedIn } = useClientAuthStore.getState()
        if (!isLoggedIn) return
        set((s) => ({ isEditMode: !s.isEditMode }))
      },
      enterEditMode: () => {
        const { isLoggedIn } = useClientAuthStore.getState()
        if (!isLoggedIn) return
        set({ isEditMode: true })
      },
      exitEditMode: () => set({ isEditMode: false, isAiPanelOpen: false }),
      toggleAiPanel: () => set((s) => ({ isAiPanelOpen: !s.isAiPanelOpen })),
      setAiPanelOpen: (open: boolean) => set({ isAiPanelOpen: open }),

      updateField: (sectionId, field, newValue, originalValue) => {
        set((state) => ({
          pendingChanges: {
            ...state.pendingChanges,
            [buildKey(sectionId, field)]: {
              section_id: sectionId,
              field,
              original_value: originalValue,
              new_value: newValue,
              changed_at: new Date().toISOString(),
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
