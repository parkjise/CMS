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
  /** 코드형 템플릿 (기획서 11.7) */
  code?: string | null
  renderer?: 'theme' | 'code'
  styling?: 'tailwind' | 'scss'
  /** 샘플로 교체(replace_with_sample) 가능 여부 (기획서 11.8) */
  has_sample_content?: boolean
}

/** 템플릿 적용 시 콘텐츠 처리 — keep: 유지(기본) / replace_with_sample: 샘플로 교체 */
export type ContentMode = 'keep' | 'replace_with_sample'

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
  /** 적용하며 새로 추가 · 채운 섹션 수 (T-055-A) */
  added_section_count?: number
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
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      templateId,
      contentMode = 'keep',
    }: {
      templateId: string
      contentMode?: ContentMode
    }): Promise<TemplateOverride> => {
      const { data } = await api.post('/v1/templates/apply', {
        template_id: templateId,
        content_mode: contentMode,
      })
      return data.data
    },
    onSuccess: () => {
      invalidate()
      // 빠진 섹션을 샘플로 채우거나(유지 — 코드형 · 테마형 모두, T-055-A) 교체하므로 섹션 목록도 갱신
      queryClient.invalidateQueries({ queryKey: ['sections'] })
    },
  })
}

export function useRollbackTemplate() {
  const invalidate = useInvalidateTemplates()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<TemplateOverride> => {
      const { data } = await api.post('/v1/templates/rollback')
      return data.data
    },
    onSuccess: () => {
      invalidate()
      // 샘플 교체를 되돌리면 이전 섹션이 복원된다
      queryClient.invalidateQueries({ queryKey: ['sections'] })
    },
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
