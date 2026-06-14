import {
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query'
import { toast } from '@cms/ui'
import { pickErrorMessage } from './errorMessages'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { suppressGlobalError?: boolean }
    mutationMeta: { useGlobalError?: boolean; successMessage?: string }
  }
}

/**
 * 전역 에러 토스트 정책:
 * - Query: 기본 ON. 데이터 로드 실패 시 토스트.
 *   끄려면 meta: { suppressGlobalError: true }
 * - Mutation: 기본 OFF (호출 측이 context-specific 메시지로 처리).
 *   켜려면 meta: { useGlobalError: true }
 * - 401은 axios 인터셉터에서 토큰 갱신 처리 (여기 도달 시는 갱신 실패)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1분 캐시 유지
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.suppressGlobalError) return
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401) return
      toast.error(pickErrorMessage(error))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (!mutation.meta?.useGlobalError) return
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401) return
      toast.error(pickErrorMessage(error))
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const msg = mutation.meta?.successMessage
      if (msg) toast.success(msg)
    },
  }),
})
