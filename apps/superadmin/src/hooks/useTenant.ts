import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface TenantDetail {
  id: string
  slug: string
  name: string
  template_type: string
  plan_type: string
  plan_expires_at: string | null
  custom_domain: string | null
  is_active: boolean
  created_at: string
  admin_emails: string[]
}

export interface TenantStats {
  page_views: number
  unique_visitors: number
  inquiries: number
  ai_usage: number
  storage_bytes: number
}

export interface TenantFeatureItem {
  feature_id: string
  key: string
  name: string
  category: string
  required_plan: string | null
  is_beta: boolean
  is_active: boolean
  is_enabled: boolean
  enabled_at: string | null
}

export interface AuditLogItem {
  id: string
  actor_role: string
  action: string
  target_type: string
  before_value: Record<string, unknown> | null
  after_value: Record<string, unknown> | null
  created_at: string
}

export function useTenant(id: string) {
  return useQuery<TenantDetail>({
    queryKey: ['super', 'tenant', id],
    queryFn: async () => {
      const { data } = await superApi.get(`/v1/tenants/${id}`)
      return data.data as TenantDetail
    },
    enabled: !!id,
  })
}

export function useTenantStats(id: string) {
  return useQuery<TenantStats>({
    queryKey: ['super', 'tenant', id, 'stats'],
    queryFn: async () => {
      const { data } = await superApi.get(`/v1/tenants/${id}/stats`)
      return data.data as TenantStats
    },
    enabled: !!id,
  })
}

export function useTenantFeatures(id: string) {
  return useQuery<TenantFeatureItem[]>({
    queryKey: ['super', 'tenant', id, 'features'],
    queryFn: async () => {
      const { data } = await superApi.get(`/v1/tenants/${id}/features`)
      return data.data.items as TenantFeatureItem[]
    },
    enabled: !!id,
  })
}

export function useTenantAuditLogs(id: string) {
  return useQuery<AuditLogItem[]>({
    queryKey: ['super', 'tenant', id, 'audit'],
    queryFn: async () => {
      const { data } = await superApi.get(`/v1/tenants/${id}/audit-logs`)
      return data.data.items as AuditLogItem[]
    },
    enabled: !!id,
  })
}

export function useUpdateTenant(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Pick<TenantDetail, 'name' | 'custom_domain' | 'is_active'>>) => {
      const { data } = await superApi.patch(`/v1/tenants/${id}`, patch)
      return data.data as TenantDetail
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super', 'tenant', id] }),
  })
}

export function useChangePlan(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plan_type: string) => {
      const { data } = await superApi.patch(`/v1/tenants/${id}/plan`, { plan_type })
      return data.data as TenantDetail
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super', 'tenant', id] }),
  })
}

export function useResetPassword(id: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await superApi.post(`/v1/tenants/${id}/reset-password`)
      return data.data as { admin_email: string; temporary_password: string }
    },
  })
}

/** 기능 토글 (낙관적 업데이트 + 실패 롤백). 백엔드가 Redis 캐시를 퍼지한다. */
export function useToggleFeature(id: string) {
  const qc = useQueryClient()
  const key = ['super', 'tenant', id, 'features']
  return useMutation({
    mutationFn: async ({
      featureId,
      enabled,
    }: {
      featureId: string
      enabled: boolean
    }) => {
      await superApi.patch(`/v1/tenants/${id}/features/${featureId}`, {
        is_enabled: enabled,
      })
    },
    onMutate: async ({ featureId, enabled }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<TenantFeatureItem[]>(key)
      qc.setQueryData<TenantFeatureItem[]>(key, (old) =>
        (old ?? []).map((f) =>
          f.feature_id === featureId ? { ...f, is_enabled: enabled } : f,
        ),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useImpersonate(id: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await superApi.post(`/v1/tenants/${id}/impersonate`)
      return data.data as { redirect_url: string }
    },
  })
}
