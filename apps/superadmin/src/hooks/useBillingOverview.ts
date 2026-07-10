import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface PastDueTenant {
  subscription_id: string
  tenant_id: string
  name: string
  plan_type: string
  amount: number
}

export interface BillingOverview {
  mrr: number
  past_due_count: number
  cancelled_count: number
  new_this_month: number
  past_due_tenants: PastDueTenant[]
}

export function useBillingOverview() {
  return useQuery<BillingOverview>({
    queryKey: ['super', 'billing', 'overview'],
    queryFn: async () => {
      const { data } = await superApi.get('/v1/billing/overview')
      return data.data as BillingOverview
    },
    refetchInterval: 60_000,
  })
}

export function useManualCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { data } = await superApi.post(`/v1/billing/manual-charge/${tenantId}`)
      return data.data as { status: string }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['super', 'billing', 'overview'] }),
  })
}

export function useRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      reason,
    }: {
      paymentId: string
      reason?: string
    }) => {
      const { data } = await superApi.post(`/v1/billing/refund/${paymentId}`, {
        reason,
      })
      return data.data as { status: string }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['super', 'billing', 'overview'] }),
  })
}
