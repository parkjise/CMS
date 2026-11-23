import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SuggestedField } from '@/lib/aiAssist'
import { toFieldInput } from '@/lib/boardSuggestion'

export interface AddStructureResult {
  fields: number
  categories: number
  /** 만들지 못한 수 — 최대 개수 등. 나머지는 그대로 만든다 */
  failed: number
}

/**
 * 추천 필드 · 카테고리를 차례로 만든다 (기획서 A-2, T-232-A) — 관리자가 고른 것만.
 * 하나가 실패해도 나머지는 만들고, 실패 수를 돌려준다.
 */
export function useAddSuggestedStructure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      boardId,
      fields,
      categories,
    }: {
      boardId: string
      fields: SuggestedField[]
      categories: string[]
    }): Promise<AddStructureResult> => {
      const result: AddStructureResult = { fields: 0, categories: 0, failed: 0 }
      // 순서대로 — 칸 순서가 추천 순서와 같게
      for (const field of fields) {
        try {
          await api.post(`/v1/boards/${boardId}/fields`, toFieldInput(field))
          result.fields += 1
        } catch {
          result.failed += 1
        }
      }
      for (const name of categories) {
        try {
          await api.post(`/v1/boards/${boardId}/categories`, { name })
          result.categories += 1
        } catch {
          result.failed += 1
        }
      }
      return result
    },
    onSettled: (_data, _error, { boardId }) =>
      queryClient.invalidateQueries({ queryKey: ['boards', boardId] }),
  })
}
