import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { summarizeSitemap, type SitemapSummary } from '@/lib/sitemapCheck'

export interface SeoSettings {
  id: string
  tenant_id: string
  meta_title: string | null
  meta_description: string | null
  og_image_url: string | null
  robots_txt: string | null
  google_analytics_id: string | null
  naver_site_verification: string | null
  google_site_verification: string | null
  og_title: string | null
  og_description: string | null
  canonical_url: string | null
  robots: string
  keywords: string[]
  updated_at: string
}

export interface SeoSettingsUpdate {
  meta_title?: string | null
  meta_description?: string | null
  og_image_url?: string | null
  robots_txt?: string | null
  google_analytics_id?: string | null
  naver_site_verification?: string | null
  google_site_verification?: string | null
  og_title?: string | null
  og_description?: string | null
  canonical_url?: string | null
  robots?: string
  /** 생략 = 바꾸지 않음, [] = 모두 지움 (T-040-A) */
  keywords?: string[]
}

/** 요금제별 SEO 사용 범위 — 서버가 판단 (T-040-A) */
export interface SeoLimits {
  keywords_allowed: boolean
  keywords_max: number
  keyword_max_length: number
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

export function useSeoLimits() {
  return useQuery({
    queryKey: [...SEO_KEY, 'limits'],
    queryFn: async (): Promise<SeoLimits> => {
      const { data } = await api.get('/v1/seo-settings/limits')
      return data.data
    },
    staleTime: 5 * 60 * 1000,
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

/** 홈페이지가 실제로 내보내는 사이트맵 (T-225) — 누를 때만 불러온다 */
export function useSitemapCheck(url: string, base: string, enabled: boolean) {
  return useQuery({
    queryKey: [...SEO_KEY, 'sitemap', url],
    queryFn: async (): Promise<SitemapSummary> => {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`sitemap ${res.status}`)
      return summarizeSitemap(await res.text(), base)
    },
    enabled,
    staleTime: 0,
    retry: false,
  })
}
