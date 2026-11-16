import { useParams } from 'react-router'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { BoardSectionBlock, BoardSectionNav } from '@/components/boards/BoardSectionNav'
import { PAGE } from '@/components/boards/boardStyles'
import { useBoards } from '@/hooks/useBoards'
import { BoardCategoriesSection } from '@/pages/BoardCategoriesPage'
import { BoardFieldsSection } from '@/pages/BoardFieldsPage'

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
