import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 이용약관 · 개인정보처리방침 (T-200) */
export type PolicyKind = 'terms' | 'privacy'

export interface PolicyDocument {
  kind: PolicyKind
  title: string
  body: string
  /** 고친 것이 없어 기본 문안을 보여 주는 중 */
  is_default: boolean
  updated_at: string | null
  /** 되돌리기 · 비교용 기본 문안 */
  default_body: string
}

export type Policies = Record<PolicyKind, PolicyDocument>

const POLICIES_KEY = ['site-settings', 'policies'] as const

export function usePolicies() {
  return useQuery({
    queryKey: POLICIES_KEY,
    queryFn: async (): Promise<Policies> => {
      const { data } = await api.get('/v1/site-settings/policies')
      return data.data
    },
  })
}

/** body 가 null 이면 기본 문안으로 되돌린다 */
export function useUpdatePolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      kind,
      body,
    }: {
      kind: PolicyKind
      body: string | null
    }): Promise<PolicyDocument> => {
      const { data } = await api.put(`/v1/site-settings/policies/${kind}`, { body })
      return data.data
    },
    onSuccess: (saved) =>
      queryClient.setQueryData<Policies>(POLICIES_KEY, (old) =>
        old ? { ...old, [saved.kind]: saved } : old
      ),
  })
}
