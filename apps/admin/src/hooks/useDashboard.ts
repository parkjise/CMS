import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface DashboardStats {
  today_page_views: number
  today_unique_visitors: number
  week_page_views: number
  week_unique_visitors: number
  new_inquiries_today: number
  pending_inquiries: number
}

export interface ChartPoint {
  date: string // YYYY-MM-DD
  page_views: number
  unique_visitors: number
}

export interface RecentInquiry {
  id: string
  name: string
  inquiry_type: string
  status: string
  created_at: string | null
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const { data } = await api.get('/v1/dashboard/stats')
      return data.data
    },
    staleTime: 30 * 1000,
  })
}

export function useDashboardChart() {
  return useQuery({
    queryKey: ['dashboard', 'chart'],
    queryFn: async (): Promise<ChartPoint[]> => {
      const { data } = await api.get('/v1/dashboard/chart')
      return data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useRecentInquiries() {
  return useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: async (): Promise<RecentInquiry[]> => {
      const { data } = await api.get('/v1/dashboard/recent-inquiries')
      return data.data
    },
    staleTime: 15 * 1000,
  })
}
