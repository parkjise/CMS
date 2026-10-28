import { describe, expect, it } from 'vitest'
import { applyResultMessage } from '@/lib/templateApply'

// 템플릿 적용 결과 안내 — 샘플로 채운 섹션 수 (T-055-A)

describe('applyResultMessage', () => {
  it('채운 섹션이 있으면 몇 개인지 · 바꿔 달라고 안내', () => {
    expect(applyResultMessage('일반 기본', 'keep', 4)).toBe(
      "'일반 기본' 템플릿을 적용했습니다. 새 템플릿에 맞춰 섹션 4개를 샘플 문구로 채웠어요 — 내 내용으로 바꿔 주세요.",
    )
  })

  it('채운 섹션이 없으면 간단히', () => {
    expect(applyResultMessage('일반 기본', 'keep', 0)).toBe("'일반 기본' 템플릿을 적용했습니다.")
    expect(applyResultMessage('일반 기본', 'keep')).toBe("'일반 기본' 템플릿을 적용했습니다.")
  })

  it('샘플로 교체', () => {
    expect(applyResultMessage('하스피털 A', 'replace_with_sample', 9)).toBe(
      "'하스피털 A' 템플릿 샘플로 교체했습니다.",
    )
  })
})
