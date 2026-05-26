export type TemplateType = 'HOSPITAL' | 'PENSION' | 'STARTUP' | 'GENERAL'

export type PlanType = 'BASIC' | 'STANDARD' | 'PREMIUM'

export interface Tenant {
  id: string
  slug: string
  name: string
  template_type: TemplateType
  plan_type: PlanType
  plan_expires_at: string | null
  custom_domain: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TenantCreate {
  slug: string
  name: string
  template_type: TemplateType
  plan_type?: PlanType
}

export interface TenantUpdate {
  name?: string
  template_type?: TemplateType
  plan_type?: PlanType
  plan_expires_at?: string | null
  custom_domain?: string | null
  is_active?: boolean
}
