import { useState } from 'react'
import { useParams } from 'react-router'
import type { Board, BoardOperation } from '@cms/types'
import { Button, Toggle, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoards, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'

const CARD_CLASS = 'space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm'

function OperationForm({ board }: { board: Board }) {
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const [operation, setOperation] = useState<BoardOperation>(board.operation)
  const memberWrite = board.permissions.write === 'MEMBER'
  const changed =
    operation.allow_secret !== board.operation.allow_secret ||
    operation.notify_new_post !== board.operation.notify_new_post
  const change = (next: Partial<BoardOperation>) => setOperation((current) => ({ ...current, ...next }))

  const save = async () => {
    try {
      await updateBoard.mutateAsync({ id: board.id, payload: { operation } })
      toast.success('저장했습니다.')
    } catch (err) {
      toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
    }
  }

  return (
    <form
      className="mx-auto max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {!memberWrite && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          아래 설정은 회원이 홈페이지에서 쓰는 글에 쓰입니다. 권한 탭에서 글쓰기를 회원도로 바꾸면 적용됩니다.
        </p>
      )}
      <ReadOnlyFieldset>
        <div className={CARD_CLASS}>
          <Toggle
            label="비밀글 허용"
            description="회원이 글쓰기에서 비밀글을 고를 수 있습니다. 홈페이지 목록에는 제목만 보이고, 내용은 쓴 회원과 관리자만 봅니다."
            checked={operation.allow_secret}
            onChange={(e) => change({ allow_secret: e.target.checked })}
          />
          {board.operation.allow_secret && !operation.allow_secret && (
            <p className="text-sm text-amber-700">끄더라도 이미 쓴 비밀글은 그대로 비밀글로 남습니다.</p>
          )}
        </div>
        <div className={`mt-5 ${CARD_CLASS}`}>
          <Toggle
            label="새 글 알림"
            description="회원이 새 글을 쓰면 관리자 화면을 열어 둔 동안 알림이 뜹니다. 제목과 게시판 이름만 보냅니다."
            checked={operation.notify_new_post}
            onChange={(e) => change({ notify_new_post: e.target.checked })}
          />
        </div>
      </ReadOnlyFieldset>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={updateBoard.isPending} disabled={!changed}>
            저장
          </Button>
        </div>
      )}
    </form>
  )
}

/** 운영 설정 (BM-11, T-151) */
export function BoardOperationPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isLoading && <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board?.system_key && <p className="text-sm text-slate-500">기본 게시판에는 운영 설정이 없습니다.</p>}
      {board && !board.system_key && <OperationForm key={board.id} board={board} />}
    </div>
  )
}
