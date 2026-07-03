import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface TenantListItem {
  id: string
  slug: string
  name: string
  template_type: string
  plan_type: string
  is_active: boolean
  created_at: string
}

export interface TenantListData {
  items: TenantListItem[]
  total: number
  page: number
  limit: number
}

export interface TenantFilters {
  q?: string
  plan_type?: string
  is_active?: boolean
  page: number
  limit: number
}

export function useTenants(filters: TenantFilters) {
  return useQuery<TenantListData>({
    queryKey: ['super', 'tenants', filters],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        page: filters.page,
        limit: filters.limit,
      }
      if (filters.q) params.q = filters.q
      if (filters.plan_type) params.plan_type = filters.plan_type
      if (filters.is_active !== undefined) params.is_active = filters.is_active
      const { data } = await superApi.get('/v1/tenants', { params })
      return data.data as TenantListData
    },
    placeholderData: keepPreviousData,
  })
}

export interface CreateTenantInput {
  name: string
  slug: string
  template_type: string
  plan_type: string
  admin_email: string
  admin_password: string
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTenantInput) => {
      const { data } = await superApi.post('/v1/tenants', input)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super', 'tenants'] })
    },
  })
}
