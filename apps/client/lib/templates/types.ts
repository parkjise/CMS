/**
 * 기본 템플릿 6종의 클라이언트 정의 (T-056).
 *
 * 여기의 cssVariables / minPlan / recommendedIndustry 값은 백엔드 시드
 * (`apps/backend/scripts/seed.py`)의 동일 템플릿과 일치해야 한다.
 * 둘 중 하나만 바꾸면 미리보기와 실제 적용이 어긋나므로 함께 수정한다.
 *
 * cssVariables 키는 `apps/client/lib/theme.ts`의 KEY_MAP이 인식하는
 * 짧은 키(primary, font_heading, border_radius 등)를 사용한다.
 */

export type TemplateKey =
  | 'modern-minimal'
  | 'warm-trust'
  | 'nature-fresh'
  | 'professional'
  | 'vibrant-youth'
  | 'clean-shop'

export type PlanKey = 'BASIC' | 'STANDARD' | 'PREMIUM'

/** 추천 업종 — 백엔드 Template.template_type 과 매핑 */
export type IndustryType = 'HOSPITAL' | 'PENSION' | 'STARTUP' | 'GENERAL'

export interface TemplateTheme {
  key: TemplateKey
  name: string
  description: string
  recommendedIndustry: IndustryType
  minPlan: PlanKey
  thumbnailUrl: string
  /** theme.ts 가 인식하는 짧은 키 기반 CSS 변수 세트 */
  cssVariables: Record<string, string>
  /** 섹션 레이아웃 순서 */
  sectionLayouts: string[]
}
