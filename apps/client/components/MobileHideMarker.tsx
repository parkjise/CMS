'use client'

import { selectEditingUi, useEditStore } from '@/lib/editStore'

/**
 * 코드형 템플릿 — 휴대폰에서 숨길 섹션 바로 앞에 두는 표식 (T-037-D).
 * 섹션을 감싸지 않는 템플릿이라 globals.css 의 `[data-mobile-hide] + *` 규칙으로 다음 섹션을 숨긴다.
 * 편집 모드에서는 표식을 빼 섹션이 보이게 한다 (템플릿 SCSS 의 여백 보정도 함께 풀린다).
 */
export function MobileHideMarker() {
  const editing = useEditStore(selectEditingUi)
  if (editing) return null
  return <span data-mobile-hide="" hidden aria-hidden="true" />
}
