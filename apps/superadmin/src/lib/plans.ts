export const PLAN_ORDER = ['FREE', 'BASIC', 'STANDARD', 'PREMIUM'] as const

export const PLAN_TYPES = ['BASIC', 'STANDARD', 'PREMIUM'] as const

/** 테넌트 플랜이 기능의 required_plan을 충족하는지 */
export function meetsPlan(
  tenantPlan: string,
  requiredPlan: string | null,
): boolean {
  if (!requiredPlan) return true
  const t = PLAN_ORDER.indexOf(tenantPlan as (typeof PLAN_ORDER)[number])
  const r = PLAN_ORDER.indexOf(requiredPlan as (typeof PLAN_ORDER)[number])
  if (r === -1) return true
  return t >= r
}
