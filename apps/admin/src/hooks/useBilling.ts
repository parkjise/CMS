import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Subscription {
  id: string
  tenant_id: string
  plan_type: string
  status: string
  billing_email: string | null
  billing_name: string | null
  monthly_amount: number
  trial_ends_at: string | null
  current_period_start: string
  current_period_end: string
  cancelled_at: string | null
  created_at: string
}

export interface PaymentHistoryItem {
  id: string
  order_id: string
  amount: number
  status: string
  failure_reason: string | null
  receipt_url: string | null
  paid_at: string | null
  created_at: string
}

export function useSubscription() {
  return useQuery<Subscription | null>({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/v1/billing/subscription')
        return data.data as Subscription
      } catch {
        return null
      }
    },
  })
}

export function usePaymentHistory() {
  return useQuery<PaymentHistoryItem[]>({
    queryKey: ['billing', 'history'],
    queryFn: async () => {
      const { data } = await api.get('/v1/billing/history')
      return data.data.items as PaymentHistoryItem[]
    },
  })
}

export interface RegisterCardInput {
  auth_key: string
  customer_key: string
  billing_email?: string
  billing_name?: string
}

export function useRegisterCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RegisterCardInput) => {
      const { data } = await api.post('/v1/billing/register-card', input)
      return data.data as Subscription
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing'] })
    },
  })
}

export function useCancelSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await api.post('/v1/billing/cancel', { reason })
      return data.data as Subscription
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  })
}

export function useChangePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (to_plan: string) => {
      const { data } = await api.post('/v1/billing/change-plan', { to_plan })
      return data.data as Subscription
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  })
}
