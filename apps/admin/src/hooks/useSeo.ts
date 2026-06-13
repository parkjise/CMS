import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SeoSettings {
  id: string
  tenant_id: string
  meta_title: string | null
  meta_description: string | null
  og_image_url: string | null
  robots_txt: string | null
  google_analytics_id: string | null
  naver_site_verification: string | null
  updated_at: string
}

export interface SeoSettingsUpdate {
  meta_title?: string | null
  meta_description?: string | null
  og_image_url?: string | null
  robots_txt?: string | null
  google_analytics_id?: string | null
  naver_site_verification?: string | null
}

const SEO_KEY = ['seo-settings'] as const

export function useSeoSettings() {
  return useQuery({
    queryKey: SEO_KEY,
    queryFn: async (): Promise<SeoSettings | null> => {
      const { data } = await api.get('/v1/seo-settings')
      return data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useUpdateSeo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SeoSettingsUpdate): Promise<SeoSettings> => {
      const { data } = await api.put('/v1/seo-settings', payload)
      return data.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(SEO_KEY, updated)
    },
  })
}
