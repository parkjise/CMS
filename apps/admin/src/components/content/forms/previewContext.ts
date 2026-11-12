import { createContext, useContext } from 'react'

/**
 * 섹션 편집 [미리보기] (T-206, AD-02) — 저장 바의 [미리보기] 를 누르면 폼이
 * 저장 대신 미리보기로 제출된다. 편집 화면(SectionEditorPage)이 제공한다.
 */
export interface SectionPreviewActions {
  /** 다음 제출을 미리보기로 — 새 탭은 누르는 순간 연다 (팝업 차단 방지) */
  markPreview: () => void
  isPreviewing: boolean
}

export const SectionPreviewContext = createContext<SectionPreviewActions | null>(null)

export const useSectionPreview = () => useContext(SectionPreviewContext)
