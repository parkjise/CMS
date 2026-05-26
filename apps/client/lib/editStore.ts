'use client'

import { create } from 'zustand'
import { authApi } from './api'

interface PendingChange {
  section_id: string
  field: string
  original_value: string
  new_value: string
  changed_at: Date
}

interface EditStore {
  // key 형식: "{section_id}:{field}"
  pendingChanges: Record<string, PendingChange>
  isDirty: boolean

  updateField: (sectionId: string, field: string, newValue: string, originalValue: string) => void
  saveAll: () => Promise<void>
  discardAll: () => void
}

export const useEditStore = create<EditStore>((set, get) => ({
  pendingChanges: {},
  isDirty: false,

  updateField: (sectionId, field, newValue, originalValue) => {
    const key = `${sectionId}:${field}`
    set((state) => {
      const updated = {
        ...state.pendingChanges,
        [key]: {
          section_id: sectionId,
          field,
          original_value: originalValue,
          new_value: newValue,
          changed_at: new Date(),
        },
      }
      return { pendingChanges: updated, isDirty: true }
    })
  },

  saveAll: async () => {
    const { pendingChanges } = get()

    // 섹션별로 그룹핑 후 batch-save API 호출
    const grouped: Record<string, Array<{ field: string; value: string }>> = {}
    for (const change of Object.values(pendingChanges)) {
      if (!grouped[change.section_id]) grouped[change.section_id] = []
      grouped[change.section_id].push({ field: change.field, value: change.new_value })
    }

    const payload = Object.entries(grouped).map(([section_id, changes]) => ({
      section_id,
      changes,
    }))

    await authApi.post('/edit/batch-save', { sections: payload })
    set({ pendingChanges: {}, isDirty: false })
  },

  discardAll: () => {
    set({ pendingChanges: {}, isDirty: false })
  },
}))
