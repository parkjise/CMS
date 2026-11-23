import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { type AssistKind, type AssistResponse, type AssistTone, isAiPreview } from '@/lib/aiAssist'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useFeatureStore } from '@/stores/featureStore'

/** AI 보조 버튼을 보일지 — 기능 스위치가 켜졌거나(서버 T-231-B 뒤) 개발 미리보기, 보기 전용은 숨김 */
export function useAiAssistEnabled(flag: string): boolean {
  const enabled = useFeatureStore((s) => s.isEnabled(flag))
  const canEdit = useCanEdit()
  return canEdit && (enabled || isAiPreview())
}

/** `POST /api/v1/ai/assist/{kind}` — 결과는 미리보기로만, 저장은 관리자가 (기획서 2.0) */
export function useAiAssist<K extends AssistKind>(kind: K) {
  return useMutation({
    mutationFn: async (tone: AssistTone): Promise<AssistResponse<K>> => {
      // DEV 를 먼저 봐야 운영 빌드에서 예시 결과 파일이 아예 빠진다
      if (import.meta.env.DEV && isAiPreview()) {
        const { previewAssist } = await import('@/lib/aiAssistPreview')
        return previewAssist(kind, tone)
      }
      const { data } = await api.post(`/v1/ai/assist/${kind}`, { tone })
      return data.data
    },
  })
}
