/**
 * 테넌트 생성 시 고를 수 있는 시작 템플릿 (기획서 11.8, T-120)
 * code 는 templates.code (백엔드 시드 CODE_TEMPLATES · 클라이언트 templates/registry 와 같은 값).
 * 빈 값이면 기존 기본 섹션(메인 배너·소개·서비스·문의)으로 시작한다.
 */
export interface StartTemplateOption {
  code: string
  label: string
  /** 시작 템플릿이 정해지면 업종도 맞춘다 */
  templateType?: string
}

export const START_TEMPLATES: StartTemplateOption[] = [
  { code: '', label: '기본 섹션으로 시작' },
  { code: 'TPL_HOSPITAL_A', label: '하스피털 A — 샘플 문구·이미지 포함', templateType: 'HOSPITAL' },
]
