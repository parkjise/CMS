import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Section } from '@/hooks/useSections'

export interface SettingUpdate {
  field_key: string
  field_value: string | null
  value_type: 'STRING' | 'INTEGER' | 'BOOLEAN' | 'JSON' | 'URL'
}

export interface SectionUpdatePayload {
  label?: string
  is_active?: boolean
  settings?: SettingUpdate[]
}

const sectionQueryKey = (id: string) => ['section', id] as const

export function useSection(sectionId: string | undefined) {
  return useQuery({
    queryKey: sectionId ? sectionQueryKey(sectionId) : ['section', 'none'],
    enabled: Boolean(sectionId),
    queryFn: async (): Promise<Section> => {
      const { data } = await api.get(`/v1/sections/${sectionId}`)
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useUpdateSection(sectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SectionUpdatePayload): Promise<Section> => {
      const { data } = await api.patch(`/v1/sections/${sectionId}`, payload)
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(sectionQueryKey(sectionId), updated)
      queryClient.invalidateQueries({ queryKey: ['sections'] })
    },
  })
}
