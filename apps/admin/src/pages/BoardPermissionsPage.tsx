import { useState } from 'react'
import { useParams } from 'react-router'
import type { Board, BoardReadAccess } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoards, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useFeatureStore } from '@/stores/featureStore'

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-slate-700'
const CARD_CLASS = 'space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm'

const READ_OPTIONS: { value: BoardReadAccess; label: string; hint: string }[] = [
  { value: 'PUBLIC', label: '누구나', hint: '홈페이지 방문자 모두 글을 읽습니다. 검색 결과에도 나올 수 있습니다.' },
  {
    value: 'MEMBER',
    label: '회원만',
    hint: '로그인한 방문자 회원만 글을 읽습니다. 검색 결과와 사이트맵에서 빠집니다.',
  },
]

function PermissionsForm({ board }: { board: Board }) {
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const [read, setRead] = useState<BoardReadAccess>(board.permissions.read)
  // 기능 목록을 아직 못 읽었으면 막지 않는다 — 서버가 다시 확인한다
  const memberOff = useFeatureStore((s) => s.settled && !s.isEnabled('SITE_MEMBER'))

  const save = async () => {
    try {
      await updateBoard.mutateAsync({
        id: board.id,
        payload: { permissions: { ...board.permissions, read } },
      })
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
      <ReadOnlyFieldset>
        <div className={CARD_CLASS}>
          <fieldset>
            <legend className={LABEL_CLASS}>글 읽기</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {READ_OPTIONS.map((option) => {
                const blocked = option.value === 'MEMBER' && memberOff && read !== 'MEMBER'
                return (
                  <label
                    key={option.value}
                    className={`flex gap-3 rounded-lg border p-3 text-sm ${
                      read === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'
                    } ${blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="board-read"
                      className="mt-0.5"
                      checked={read === option.value}
                      disabled={blocked}
                      onChange={() => setRead(option.value)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">{option.label}</span>
                      <span className="mt-0.5 block text-slate-500">{option.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          {memberOff && (
            <p className="text-sm text-amber-700">
              {read === 'MEMBER'
                ? '방문자 회원 기능이 꺼져 있어 지금은 아무도 이 게시판의 글을 읽을 수 없습니다. 누구나로 바꾸거나 회원 기능을 켜 주세요.'
                : '방문자 회원 기능이 꺼져 있어 회원만 읽기를 고를 수 없습니다.'}
            </p>
          )}
          {read === 'MEMBER' && (
            <p className="text-sm text-slate-500">
              게시판은 상단 메뉴에 그대로 보이고, 로그인하지 않은 방문자에게는 로그인 안내가 나옵니다.
            </p>
          )}
        </div>

        <div className={`mt-5 ${CARD_CLASS}`}>
          <p className={LABEL_CLASS}>글쓰기</p>
          <p className="text-sm text-slate-900">관리자만</p>
          <p className="text-sm text-slate-500">글은 관리자 화면과 홈페이지의 [글쓰기] 버튼으로 관리자만 씁니다.</p>
        </div>
      </ReadOnlyFieldset>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={updateBoard.isPending} disabled={read === board.permissions.read}>
            저장
          </Button>
        </div>
      )}
    </form>
  )
}

/** 게시판 권한 (BM-10, T-150) */
export function BoardPermissionsPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isLoading && <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board?.system_key && <p className="text-sm text-slate-500">기본 게시판은 누구나 읽을 수 있고 권한을 바꿀 수 없습니다.</p>}
      {board && !board.system_key && <PermissionsForm key={board.id} board={board} />}
    </div>
  )
}
