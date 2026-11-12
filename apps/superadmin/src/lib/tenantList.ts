/** 사업체 목록 업종 · 정렬 (T-205, SA-02) — 백엔드 TemplateType · TenantSort 와 같아야 한다 */

export const TEMPLATE_LABELS: Record<string, string> = {
  HOSPITAL: '병원',
  PENSION: '펜션',
  STARTUP: '스타트업',
  GENERAL: '일반',
}

export const TENANT_SORTS = [
  { value: 'created_desc', label: '최근 가입순' },
  { value: 'created_asc', label: '오래된 가입순' },
  { value: 'name', label: '이름순' },
  { value: 'expires_asc', label: '만료 임박순' },
  { value: 'visitors_desc', label: '방문자 많은순' },
  { value: 'inquiries_desc', label: '문의 많은순' },
] as const

export type TenantSort = (typeof TENANT_SORTS)[number]['value']
