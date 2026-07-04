import { useQuery } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface AiCostMonthly {
  month: string
  tokens: number
  cost_usd: number
}

export interface MonitoringData {
  ai_cost: {
    monthly: AiCostMonthly[]
    total_tokens: number
    estimated_cost_usd: number
  }
  kakao: {
    this_month_count: number
    estimated_cost_krw: number
  }
  queue: {
    pending: number
    workers: number
  }
  errors: {
    sentry_configured: boolean
    items: { message: string; count: number }[]
  }
}

export function useMonitoring() {
  return useQuery<MonitoringData>({
    queryKey: ['super', 'monitoring'],
    queryFn: async () => {
      const { data } = await superApi.get('/v1/monitoring')
      return data.data as MonitoringData
    },
    refetchInterval: 60_000,
  })
}
