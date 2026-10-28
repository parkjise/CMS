import type { ContentMode } from '@/hooks/useTemplates'

/**
 * 템플릿 적용 결과 안내 (T-055-A).
 * 내용 유지로 바꾸면 홈이 비지 않게 빠진 섹션을 샘플 문구로 채우므로, 몇 개를 채웠는지 알린다.
 */
export function applyResultMessage(
  name: string,
  contentMode: ContentMode,
  addedSectionCount = 0,
): string {
  if (contentMode === 'replace_with_sample') return `'${name}' 템플릿 샘플로 교체했습니다.`
  if (addedSectionCount > 0) {
    return `'${name}' 템플릿을 적용했습니다. 새 템플릿에 맞춰 섹션 ${addedSectionCount}개를 샘플 문구로 채웠어요 — 내 내용으로 바꿔 주세요.`
  }
  return `'${name}' 템플릿을 적용했습니다.`
}
