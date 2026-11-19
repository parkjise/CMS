import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AeoResponse, GeoResponse, GeoSettings } from '@cms/types'
import { api } from '@/lib/api'

/** 사이트 관리 AEO · GEO (T-221) */
const AEO_KEY = ['seo-settings', 'aeo'] as const
const GEO_KEY = ['seo-settings', 'geo'] as const

export function useAeo() {
  return useQuery({
    queryKey: AEO_KEY,
    queryFn: async (): Promise<AeoResponse> => {
      const { data } = await api.get('/v1/seo-settings/aeo')
      return data.data
    },
  })
}

export function useUpdateAeo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (faqBoardIds: string[]): Promise<AeoResponse> => {
      const { data } = await api.put('/v1/seo-settings/aeo', { faq_board_ids: faqBoardIds })
      return data.data
    },
    onSuccess: (updated) => queryClient.setQueryData(AEO_KEY, updated),
  })
}

export function useGeo() {
  return useQuery({
    queryKey: GEO_KEY,
    queryFn: async (): Promise<GeoResponse> => {
      const { data } = await api.get('/v1/seo-settings/geo')
      return data.data
    },
  })
}

export function useUpdateGeo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: GeoSettings): Promise<GeoResponse> => {
      const { data } = await api.put('/v1/seo-settings/geo', settings)
      return data.data
    },
    onSuccess: (updated) => queryClient.setQueryData(GEO_KEY, updated),
  })
}
