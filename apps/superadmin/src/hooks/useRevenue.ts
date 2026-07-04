import { useQuery } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface MrrTrendPoint {
  month: string
  mrr: number
}

export interface PlanDistributionItem {
  plan: string
  count: number
}

export interface ExpiringTenant {
  id: string
  slug: string
  name: string
  plan_type: string
  plan_expires_at: string | null
  days_left: number
}

export interface RevenueData {
  mrr_trend: MrrTrendPoint[]
  plan_distribution: PlanDistributionItem[]
  expiring_tenants: ExpiringTenant[]
  movement: {
    new: number
    churned: number
    upgraded: number
    downgraded: number
  }
}

export function useRevenue(months: 3 | 6 | 12) {
  return useQuery<RevenueData>({
    queryKey: ['super', 'revenue', months],
    queryFn: async () => {
      const { data } = await superApi.get('/v1/revenue', { params: { months } })
      return data.data as RevenueData
    },
  })
}
