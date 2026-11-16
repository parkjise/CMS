import { useParams } from 'react-router'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import {
  BoardSectionBlock,
  type BoardSectionLink,
  BoardSectionNav,
} from '@/components/boards/BoardSectionNav'
import { PAGE } from '@/components/boards/boardStyles'
import { useBoards } from '@/hooks/useBoards'
import { BoardConnectionSection } from '@/pages/BoardConnectionPage'
import { BoardOperationSection } from '@/pages/BoardOperationPage'
import { BoardPermissionsSection } from '@/pages/BoardPermissionsPage'
import { BoardSettingsSection } from '@/pages/BoardSettingsPage'

/**
 * 게시판 설정 (T-212, 1113 #13) — 기본 정보 · 권한 · 운영 설정 · 홈페이지 연결을 한 화면에.
 * 저장은 구역마다 따로 한다 (서버 API 그대로). 예전 주소는 #구역 으로 들어온다.
 */
export function BoardSetupPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)
  // 기본 게시판(공지)에는 권한 · 운영 설정이 없다
  const sections: BoardSectionLink[] = [
    { id: 'basic', label: '기본 정보' },
    ...(board?.system_key
      ? []
      : [
          { id: 'permissions', label: '권한' },
          { id: 'operation', label: '운영 설정' },
        ]),
    { id: 'connection', label: '홈페이지 연결' },
  ]

  return (
    <div className={PAGE}>
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && (
        <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>
      )}
      {board && (
        <>
          <BoardSectionNav sections={sections} />
          <BoardSectionBlock id="basic" title="기본 정보">
            <BoardSettingsSection boardId={boardId} />
          </BoardSectionBlock>
          {!board.system_key && (
            <>
              <BoardSectionBlock id="permissions" title="권한">
                <BoardPermissionsSection boardId={boardId} />
              </BoardSectionBlock>
              <BoardSectionBlock id="operation" title="운영 설정">
                <BoardOperationSection boardId={boardId} />
              </BoardSectionBlock>
            </>
          )}
          <BoardSectionBlock id="connection" title="홈페이지 연결">
            <BoardConnectionSection boardId={boardId} />
          </BoardSectionBlock>
        </>
      )}
    </div>
  )
}
