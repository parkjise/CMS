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
      return status && status !== 'ACTIVE' && status !== 'FAILED' ? 30_000 : false
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
