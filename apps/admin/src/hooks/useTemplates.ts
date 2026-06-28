import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type IndustryType = 'HOSPITAL' | 'PENSION' | 'STARTUP' | 'GENERAL'

export interface TemplateItem {
  id: string
  template_type: IndustryType
  name: string
  description: string | null
  thumbnail_url: string | null
  css_variables: Record<string, string>
  section_layouts: string[]
  is_active: boolean
  min_plan: string
  locked: boolean
}

export interface TemplateList {
  templates: TemplateItem[]
  current_template_id: string | null
}

export interface TemplateOverride {
  id: string
  tenant_id: string
  template_id: string
  css_overrides: Record<string, string>
  applied_at: string
}

/** 업종 한국어 라벨 (필터 탭/카드 태그용) */
export const INDUSTRY_LABELS: Record<IndustryType, string> = {
  HOSPITAL: '병원·의원',
  PENSION: '펜션·숙박',
  STARTUP: '스타트업·IT',
  GENERAL: '범용',
}

const templatesKey = (industry?: string) =>
  ['templates', industry ?? 'all'] as const

export function useTemplates(industry?: IndustryType) {
  return useQuery({
    queryKey: templatesKey(industry),
    queryFn: async (): Promise<TemplateList> => {
      const { data } = await api.get('/v1/templates', {
        params: industry ? { industry } : undefined,
      })
      return data.data
    },
    staleTime: 60 * 1000,
  })
}

function useInvalidateTemplates() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['templates'] })
}

export function useApplyTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: async (templateId: string): Promise<TemplateOverride> => {
      const { data } = await api.post('/v1/templates/apply', {
        template_id: templateId,
      })
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useRollbackTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: async (): Promise<TemplateOverride> => {
      const { data } = await api.post('/v1/templates/rollback')
      return data.data
    },
    onSuccess: invalidate,
  })
}

export function useCustomizeTemplate() {
  const invalidate = useInvalidateTemplates()
  return useMutation({
    mutationFn: async (
      cssOverrides: Record<string, string>,
    ): Promise<TemplateOverride> => {
      const { data } = await api.patch('/v1/templates/customize', {
        css_overrides: cssOverrides,
      })
      return data.data
    },
    onSuccess: invalidate,
  })
}
