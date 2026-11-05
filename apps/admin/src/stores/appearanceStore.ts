import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppearanceState {
  mode: 'light' | 'dark'
  collapsed: boolean
  setMode: (mode: 'light' | 'dark') => void
  setCollapsed: (collapsed: boolean) => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      mode: 'light',
      collapsed: false,
      setMode: (mode) => set({ mode }),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: 'cms-admin-appearance' }
  )
)
