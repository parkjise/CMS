import { useParams } from 'react-router'
import { toast } from '@cms/ui'
import { BoardSuggestAssist, type BoardSuggestionPick } from '@/components/ai/BoardSuggestAssist'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { BoardSectionBlock, BoardSectionNav } from '@/components/boards/BoardSectionNav'
import { PAGE } from '@/components/boards/boardStyles'
import { useBoardCategories } from '@/hooks/useBoardCategories'
import { useBoardFields } from '@/hooks/useBoardFields'
import { useBoards } from '@/hooks/useBoards'
import { useAddSuggestedStructure } from '@/hooks/useBoardSuggestion'
import { BoardCategoriesSection } from '@/pages/BoardCategoriesPage'
import { BoardFieldsSection } from '@/pages/BoardFieldsPage'

/** [✨ 필드 · 카테고리 추천] (기획서 A-2, T-232-A) — 고른 것만 차례로 추가, 같은 이름은 건너뜀 */
function StructureSuggest({ boardId, description }: { boardId: string; description: string }) {
  const fieldsQuery = useBoardFields(boardId)
  const categoriesQuery = useBoardCategories(boardId)
  const addStructure = useAddSuggestedStructure()

  const add = async ({ fields, categories }: BoardSuggestionPick) => {
    const result = await addStructure.mutateAsync({ boardId, fields, categories })
    const added = [
      ...(result.fields ? [`필드 ${result.fields}개`] : []),
      ...(result.categories ? [`카테고리 ${result.categories}개`] : []),
    ].join(' · ')
    if (added) toast.success(`${added}를 추가했어요.`)
    if (result.failed) {
      toast.error(`${result.failed}개는 추가하지 못했어요. 최대 개수를 넘었는지 확인해 주세요.`)
    }
  }

  return (
    <BoardSuggestAssist
      mode="structure"
      buttonLabel="필드 · 카테고리 추천"
      title="필드 · 카테고리 추천"
      boardId={boardId}
      defaultPurpose={description}
      existingFields={(fieldsQuery.data ?? []).map((f) => f.label)}
      existingCategories={(categoriesQuery.data ?? []).map((c) => c.name)}
      applyLabel="고른 것 추가"
      onApply={add}
    />
  )
}

/** 필드 · 카테고리 (T-212, 1113 #13) — 글에 담을 칸과 글 분류를 한 화면에. 저장은 따로 */
export function BoardStructurePage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className={PAGE}>
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isSuccess && !board && (
        <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>
      )}
      {board?.system_key && (
        <p className="text-sm text-slate-500">기본 게시판에는 칸과 카테고리를 만들 수 없습니다.</p>
      )}
      {board && !board.system_key && (
        <>
          <div className="flex justify-end empty:hidden">
            <StructureSuggest boardId={boardId} description={board.description ?? ''} />
          </div>
          <BoardSectionNav
            sections={[
              { id: 'fields', label: '필드' },
              { id: 'categories', label: '카테고리' },
            ]}
          />
          <BoardSectionBlock id="fields" title="필드">
            <BoardFieldsSection boardId={boardId} />
          </BoardSectionBlock>
          <BoardSectionBlock id="categories" title="카테고리">
            <BoardCategoriesSection boardId={boardId} />
          </BoardSectionBlock>
        </>
      )}
    </div>
  )
}
