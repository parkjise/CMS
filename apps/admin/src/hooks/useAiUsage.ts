import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 단일 AI 기능의 이번 달 사용 현황 (백엔드 schemas/ai.py FeatureUsage 대응) */
export interface FeatureUsage {
  used: number
  limit: number | null // null = 무제한
  remaining: number | null // null = 무제한
  exceeded: boolean
  supported: boolean // 현재 플랜에서 지원 여부 (limit === 0 이면 false)
}

export interface AiUsage {
  plan_type: string
  copy_suggest: FeatureUsage
  chat_edit: FeatureUsage
}

const AI_USAGE_KEY = ['ai-usage'] as const

export function useAiUsage() {
  return useQuery({
    queryKey: AI_USAGE_KEY,
    queryFn: async (): Promise<AiUsage> => {
      const { data } = await api.get('/v1/ai/usage')
      return data.data
    },
    staleTime: 60 * 1000,
  })
}
