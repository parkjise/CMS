import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// AI 월간 리포트 (기획서 13.2 기능 3 · 13.4, T-073-A)

export interface ReportItem {
  code: string
  title: string
  detail: string
  section_id?: string | null
  section_label?: string | null
}

export interface ReportMetrics {
  period: string
  visitors: number
  prev_visitors: number
  page_views: number
  mobile_ratio: number | null
  inquiries: number
  prev_inquiries: number
}

export interface Report {
  id: string
  period: string
  kind: 'AUTO' | 'MANUAL'
  source: 'ai' | 'rule'
  summary: string
  metrics: ReportMetrics
  strengths: ReportItem[]
  improvements: ReportItem[]
  created_at: string
}

export interface ReportListItem {
  id: string
  period: string
  kind: 'AUTO' | 'MANUAL'
  source: 'ai' | 'rule'
  improvement_count: number
  created_at: string
}

export interface ReportList {
  reports: ReportListItem[]
  quota: { used: number; limit: number; remaining: number }
}

const LIST_KEY = ['ai-reports'] as const

export function useReports() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<ReportList> => {
      const { data } = await api.get('/v1/ai/reports')
      return data.data
    },
  })
}

export function useReport(id: string | null) {
  return useQuery({
    queryKey: ['ai-reports', id],
    queryFn: async (): Promise<Report> => {
      const { data } = await api.get(`/v1/ai/reports/${id}`)
      return data.data
    },
    enabled: Boolean(id),
  })
}

export function useCreateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<Report> => {
      const { data } = await api.post('/v1/ai/reports')
      return data.data
    },
    onSuccess: (report) => {
      queryClient.setQueryData(['ai-reports', report.id], report)
      queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true })
    },
  })
}
