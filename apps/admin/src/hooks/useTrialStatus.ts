import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface TrialStatus {
  is_trial: boolean
  status: string
  days_left: number
  trial_ends_at: string | null
}

export function useTrialStatus() {
  return useQuery<TrialStatus | null>({
    queryKey: ['billing', 'trial-status'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/v1/billing/trial-status')
        return data.data as TrialStatus
      } catch {
        // 구독 정보가 없으면(404 등) 체험 아님으로 처리
        return null
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}
