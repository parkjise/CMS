import type { PublicSection } from './publicSite.types'

/** 노출 중인 섹션에서 아직 바꾸지 않은 템플릿 샘플 값 개수 (기획서 11.8) */
export function countSampleSettings(sections: PublicSection[]): number {
  return sections
    .filter((s) => s.is_active)
    .reduce((sum, s) => sum + s.settings.filter((st) => st.is_sample).length, 0)
}
