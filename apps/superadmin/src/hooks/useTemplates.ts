import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { superApi } from '@/lib/superApi'

/** 슈퍼 어드민 템플릿 관리 (T-208, 기획서 14.1) */
export interface SuperTemplate {
  id: string
  template_type: string
  code: string | null
  /** theme: 공용 섹션 + 색 변수 / code: 템플릿 전용 화면(홈페이지 코드 배포 필요) */
  renderer: 'theme' | 'code' | string
  version: string
  name: string
  description: string | null
  thumbnail_url: string | null
  css_variables: Record<string, string>
  is_active: boolean
  min_plan: string
  created_at: string
  updated_at: string
  /** 지금 쓰는 사업체 수 */
  usage_count: number
}

export interface TemplateCreateInput {
  name: string
  template_type: string
  description?: string | null
  thumbnail_url?: string | null
  min_plan: string
  base_template_id?: string | null
  css_variables?: Record<string, string>
  is_active: boolean
}

export type TemplateUpdateInput = Partial<
  Pick<
    SuperTemplate,
    'name' | 'description' | 'thumbnail_url' | 'min_plan' | 'is_active' | 'css_variables'
  >
>

const KEY = ['super', 'templates'] as const

export function useSuperTemplates() {
  return useQuery<SuperTemplate[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await superApi.get('/v1/templates')
      return data.data as SuperTemplate[]
    },
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TemplateCreateInput) => {
      const { data } = await superApi.post('/v1/templates', input)
      return data.data as SuperTemplate
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TemplateUpdateInput }) => {
      const { data } = await superApi.patch(`/v1/templates/${id}`, input)
      return data.data as SuperTemplate
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
