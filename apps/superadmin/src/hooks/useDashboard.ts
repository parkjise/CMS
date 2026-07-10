import { useQuery } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface DashboardStats {
  total_tenants: number
  active_tenants: number
  new_this_month: number
  mrr: number
  kakao_sent_this_month: number
  ai_usage_this_month: number
}

export interface PlanDistributionItem {
  plan: string
  count: number
}

export interface MrrTrendPoint {
  month: string
  mrr: number
}

export interface ExpiringTenant {
  id: string
  slug: string
  name: string
  plan_type: string
  plan_expires_at: string | null
  days_left: number
}

export interface RecentTenant {
  id: string
  slug: string
  name: string
  plan_type: string
  created_at: string
}

export interface SystemStatus {
  server: boolean
  db: boolean
  redis: boolean
  celery: boolean
}

export interface ExpiringSslDomain {
  domain: string
  ssl_expires_at: string | null
  days_left: number
}

export interface DashboardData {
  stats: DashboardStats
  plan_distribution: PlanDistributionItem[]
  mrr_trend: MrrTrendPoint[]
  expiring_tenants: ExpiringTenant[]
  recent_tenants: RecentTenant[]
  ssl_expiring: ExpiringSslDomain[]
  system: SystemStatus
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['super', 'dashboard'],
    queryFn: async () => {
      const { data } = await superApi.get('/v1/dashboard')
      return data.data as DashboardData
    },
    refetchInterval: 60_000,
  })
}
