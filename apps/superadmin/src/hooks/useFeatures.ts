import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

export interface FeatureItem {
  id: string
  key: string
  name: string
  description: string | null
  category: string
  menu_path: string | null
  menu_icon: string | null
  menu_label: string | null
  menu_position: number
  default_enabled: boolean
  required_plan: string | null
  is_beta: boolean
  is_active: boolean
  release_note: string | null
  released_at: string | null
  created_at: string
  enabled_tenant_count: number
}

export interface Deployment {
  id: string
  deployment_type: string
  target_plan: string | null
  rollout_percent: number | null
  affected_count: number | null
  deployed_at: string
  rollback_at: string | null
  notes: string | null
}

export function useFeatures() {
  return useQuery<FeatureItem[]>({
    queryKey: ['super', 'features'],
    queryFn: async () => {
      const { data } = await superApi.get('/v1/features')
      return data.data.items as FeatureItem[]
    },
  })
}

export interface FeatureFormInput {
  key: string
  name: string
  category: string
  description?: string
  menu_path?: string
  menu_icon?: string
  menu_label?: string
  required_plan?: string | null
  is_beta: boolean
}

export function useCreateFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FeatureFormInput) => {
      const { data } = await superApi.post('/v1/features', input)
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super', 'features'] }),
  })
}

export function useUpdateFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<FeatureFormInput>
    }) => {
      const { data } = await superApi.patch(`/v1/features/${id}`, patch)
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super', 'features'] }),
  })
}

export interface DeployInput {
  deployment_type: 'GLOBAL' | 'PLAN_BASED' | 'SELECTIVE' | 'GRADUAL'
  target_plan?: string
  target_tenants?: string[]
  rollout_percent?: number
  notes?: string
}

export function useDeployFeature(featureId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DeployInput) => {
      const { data } = await superApi.post(
        `/v1/features/${featureId}/deploy`,
        input,
      )
      return data.data as { deployment_id: string; affected_count: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super', 'features'] })
      qc.invalidateQueries({ queryKey: ['super', 'feature', featureId, 'deployments'] })
    },
  })
}

export function useDeployments(featureId: string, enabled: boolean) {
  return useQuery<Deployment[]>({
    queryKey: ['super', 'feature', featureId, 'deployments'],
    queryFn: async () => {
      const { data } = await superApi.get(`/v1/features/${featureId}/deployments`)
      return data.data.items as Deployment[]
    },
    enabled,
  })
}

export function useRollbackDeployment(featureId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (deploymentId: string) => {
      await superApi.post(`/v1/features/${featureId}/rollback/${deploymentId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super', 'features'] })
      qc.invalidateQueries({ queryKey: ['super', 'feature', featureId, 'deployments'] })
    },
  })
}

/** 배포 시 테넌트 알림 공지 생성 (T-088). 배포 타겟과 동일 매핑. */
export async function createDeployAnnouncement(params: {
  featureName: string
  note: string
  sendKakao: boolean
  deployment_type: DeployInput['deployment_type']
  target_plan?: string
  target_tenants?: string[]
}): Promise<void> {
  const target_type =
    params.deployment_type === 'PLAN_BASED'
      ? 'PLAN_BASED'
      : params.deployment_type === 'SELECTIVE'
        ? 'SELECTIVE'
        : 'ALL'
  await superApi.post('/v1/announcements', {
    title: `새 기능: ${params.featureName}`,
    content: params.note || `${params.featureName} 기능이 추가되었습니다.`,
    type: 'FEATURE_UPDATE',
    target_type,
    target_plan: target_type === 'PLAN_BASED' ? params.target_plan : undefined,
    target_tenants:
      target_type === 'SELECTIVE' ? params.target_tenants : undefined,
    show_in_admin: true,
    send_kakao: params.sendKakao,
    publish_now: true,
  })
}
