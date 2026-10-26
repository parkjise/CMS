import type { Section } from '@/hooks/useSections'

/** 아직 샘플 값 그대로인 설정 키 (기획서 11.8) */
export function sampleKeys(section: Pick<Section, 'settings'>): string[] {
  return section.settings.filter((s) => s.is_sample).map((s) => s.field_key)
}

/** 전체 섹션에서 아직 바꾸지 않은 샘플 값 개수 — 숨긴 섹션은 세지 않는다 */
export function countSampleSettings(sections: Section[]): number {
  return sections
    .filter((s) => s.is_active)
    .reduce((sum, s) => sum + sampleKeys(s).length, 0)
}
