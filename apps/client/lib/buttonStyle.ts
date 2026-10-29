// 버튼 스타일 · 새 창 열기 (기획서 AD-02-B, T-088-A) — 관리자 폼 · 편집 모드 팝업 · 홈페이지 공통
// 저장 값: cta_style = 'filled' | 'outline', cta_new_tab = 'true' | 'false'

export type ButtonStyle = 'filled' | 'outline'

export const BUTTON_STYLE_LABELS: Record<ButtonStyle, string> = {
  filled: '채워진 버튼',
  outline: '테두리 버튼',
}

/** 모르는 값 · 빈 값은 채워진 버튼 (예전 데이터) */
export const parseButtonStyle = (value: string | null | undefined): ButtonStyle =>
  value === 'outline' ? 'outline' : 'filled'

export const parseNewTab = (value: string | null | undefined): boolean => value === 'true'
