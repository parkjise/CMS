import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type DomainStatus =
  | 'PENDING'
  | 'DNS_CHECKING'
  | 'SSL_ISSUING'
  | 'ACTIVE'
  | 'FAILED'

export interface DomainInfo {
  id: string
  tenant_id: string
  domain: string
  domain_type: string
  status: DomainStatus
  ssl_expires_at: string | null
  verified_at: string | null
  created_at: string
  cname_target: string
  /** FAILED 사유 — DNS | SSL */
  failure_code: string | null
}

export interface DomainLimits {
  custom_domain_allowed: boolean
  cname_target: string
}

/** 도메인 상태 조회 — 활성화 전까지 30초 폴링 */
export function useDomainStatus() {
  return useQuery<DomainInfo | null>({
    queryKey: ['domain', 'status'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/v1/domain/status')
        return data.data as DomainInfo
      } catch {
        return null
      }
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'SSL_ISSUING') return 10_000 // 발급은 보통 1분 안에 끝난다
      return status && status !== 'ACTIVE' && status !== 'FAILED' ? 30_000 : false
    },
  })
}

/** 요금제 잠금 · DNS 안내 값 — 서버가 판단한다 (T-137-C) */
export function useDomainLimits() {
  return useQuery<DomainLimits>({
    queryKey: ['domain', 'limits'],
    queryFn: async () => {
      const { data } = await api.get('/v1/domain/limits')
      return data.data as DomainLimits
    },
  })
}

export function useRegisterDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (domain: string) => {
      const { data } = await api.post('/v1/domain/register', {
        domain,
        domain_type: 'CUSTOM',
      })
      return data.data as DomainInfo
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain'] }),
  })
}

export function useVerifyDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/v1/domain/verify')
      return data.data as DomainInfo
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain'] }),
  })
}

export function useRemoveDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.delete('/v1/domain')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domain'] }),
  })
}
