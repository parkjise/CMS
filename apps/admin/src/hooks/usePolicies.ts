import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** 이용약관 · 개인정보처리방침 (T-200) · 버전 · 예약 (T-224) */
export type PolicyKind = 'terms' | 'privacy'
export type PolicyStatus = 'draft' | 'scheduled' | 'published' | 'archived'

export interface PolicyVersionSummary {
  id: string
  version: number
  status: PolicyStatus
  summary: string | null
  effective_at: string | null
  published_at: string | null
  archived_at: string | null
  created_at: string
}

export interface PolicyWorkingVersion extends PolicyVersionSummary {
  body: string
}

export interface PolicyVersionDocument extends PolicyVersionSummary {
  kind: PolicyKind
  title: string
  body: string
}

export interface PolicyDocument {
  kind: PolicyKind
  title: string
  /** 홈페이지에 보이는 본문 — 공개본, 없으면 기본 문안 */
  body: string
  is_default: boolean
  updated_at: string | null
  version: number | null
  effective_at: string | null
  /** 새 버전을 기본 문안으로 시작할 때 · 비교용 */
  default_body: string
  /** 작업 중인 버전(초안 · 예약) — 하나만 */
  working: PolicyWorkingVersion | null
  /** 버전 이력 — 최신부터 */
  versions: PolicyVersionSummary[]
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

/** 버전 한 개의 본문 — 이력 보기 */
export function usePolicyVersion(kind: PolicyKind, version: number | null) {
  return useQuery({
    queryKey: [...POLICIES_KEY, kind, version],
    enabled: version !== null,
    queryFn: async (): Promise<PolicyVersionDocument> => {
      const { data } = await api.get(`/v1/site-settings/policies/${kind}/versions/${version}`)
      return data.data
    },
  })
}

/** 서버가 돌려준 문서로 목록을 바꾼다 */
function usePolicyMutation<T>(request: (input: T) => Promise<PolicyDocument>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (saved) =>
      queryClient.setQueryData<Policies>(POLICIES_KEY, (old) =>
        old ? { ...old, [saved.kind]: saved } : old
      ),
  })
}

/** 새 버전 — 공개본(없으면 기본 문안)을 복사한 초안 */
export const useCreatePolicyDraft = () =>
  usePolicyMutation(async (kind: PolicyKind) => {
    const { data } = await api.post(`/v1/site-settings/policies/${kind}/draft`)
    return data.data
  })

export const useSavePolicyDraft = () =>
  usePolicyMutation(
    async ({ kind, body, summary }: { kind: PolicyKind; body: string; summary: string }) => {
      const { data } = await api.put(`/v1/site-settings/policies/${kind}/draft`, { body, summary })
      return data.data
    }
  )

/** effectiveAt 이 없으면 바로 공개, 앞날이면 예약 */
export const usePublishPolicy = () =>
  usePolicyMutation(
    async ({ kind, effectiveAt }: { kind: PolicyKind; effectiveAt: string | null }) => {
      const { data } = await api.post(`/v1/site-settings/policies/${kind}/publish`, {
        effective_at: effectiveAt,
      })
      return data.data
    }
  )

export const useCancelPolicySchedule = () =>
  usePolicyMutation(async (kind: PolicyKind) => {
    const { data } = await api.post(`/v1/site-settings/policies/${kind}/cancel-schedule`)
    return data.data
  })
