import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AnalyticsPoint {
  date: string
  page_views: number
  unique_visitors: number
}

export interface MobileRatio {
  mobile: number
  desktop: number
  total: number
}

export interface ReferrerItem {
  source: string
  count: number
}

export interface AnalyticsTimeseries {
  days: number
  max_days: number
  series: AnalyticsPoint[]
  mobile_ratio: MobileRatio
  top_referrers: ReferrerItem[]
}

/** 선택 가능한 기간 옵션(일) */
export const RANGE_OPTIONS = [7, 30, 90] as const
export type RangeOption = (typeof RANGE_OPTIONS)[number]

export function useAnalytics(days: RangeOption) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', days],
    queryFn: async (): Promise<AnalyticsTimeseries> => {
      const { data } = await api.get('/v1/analytics/timeseries', {
        params: { days },
      })
      return data.data
    },
    staleTime: 60 * 1000,
  })
}
