import { useState } from 'react'
import { useParams } from 'react-router'
import type { Board, BoardPermissions } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { PAGE } from '@/components/boards/boardStyles'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoards, usePermissionOptions, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'
import { type PermissionOption as Option, READ_OPTIONS, WRITE_OPTIONS } from '@/lib/boardPermissions'

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-slate-700'
const CARD_CLASS = 'space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm'

interface ChoiceProps<T extends string> {
  name: string
  legend: string
  options: Option<T>[]
  value: T
  /** 회원 값을 고를 수 없는 이유 — 이미 그 값이면 막지 않는다 */
  memberBlocked: string | null
  saved: T
  onChange: (value: T) => void
}

function Choice<T extends string>({ name, legend, options, value, memberBlocked, saved, onChange }: ChoiceProps<T>) {
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const blocked = option.value === 'MEMBER' && Boolean(memberBlocked) && saved !== 'MEMBER'
          return (
            <label
              key={option.value}
              className={`flex gap-3 rounded-lg border p-3 text-sm ${
                value === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'
              } ${blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name={name}
                className="mt-0.5"
                checked={value === option.value}
                disabled={blocked}
                onChange={() => onChange(option.value)}
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
  )
}

function PermissionsForm({ board }: { board: Board }) {
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  // 못 읽었으면 막지 않는다 — 저장할 때 서버가 다시 확인한다
  const options = usePermissionOptions(board.id).data
  const readBlocked = options?.member_read_blocked ?? null
  const writeBlocked = options?.member_write_blocked ?? null
  const [permissions, setPermissions] = useState<BoardPermissions>(board.permissions)
  const saved = board.permissions
  const changed = permissions.read !== saved.read || permissions.write !== saved.write

  const save = async () => {
    try {
      await updateBoard.mutateAsync({ id: board.id, payload: { permissions } })
      toast.success('저장했습니다.')
    } catch (err) {
      toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <ReadOnlyFieldset>
        <div className={CARD_CLASS}>
          <Choice
            name="board-read"
            legend="글 읽기"
            options={READ_OPTIONS}
            value={permissions.read}
            saved={saved.read}
            memberBlocked={readBlocked}
            onChange={(read) => setPermissions((current) => ({ ...current, read }))}
          />
          {readBlocked && (
            <p className="text-sm text-amber-700">
              {permissions.read === 'MEMBER'
                ? '방문자 회원 기능이 꺼져 있어 지금은 아무도 이 게시판의 글을 읽을 수 없습니다. 누구나로 바꾸거나 회원 기능을 켜 주세요.'
                : '방문자 회원 기능이 꺼져 있어 회원만 읽기를 고를 수 없습니다.'}
            </p>
          )}
          {permissions.read === 'MEMBER' && (
            <p className="text-sm text-slate-500">
              게시판은 상단 메뉴에 그대로 보이고, 로그인하지 않은 방문자에게는 로그인 안내가 나옵니다.
            </p>
          )}
        </div>

        <div className={`mt-5 ${CARD_CLASS}`}>
          <Choice
            name="board-write"
            legend="글쓰기"
            options={WRITE_OPTIONS}
            value={permissions.write}
            saved={saved.write}
            memberBlocked={writeBlocked}
            onChange={(write) => setPermissions((current) => ({ ...current, write }))}
          />
          {writeBlocked && (
            <p className="text-sm text-amber-700">
              {permissions.write === 'MEMBER' ? `지금은 회원이 글을 쓸 수 없습니다. ${writeBlocked}` : writeBlocked}
            </p>
          )}
          {permissions.write === 'MEMBER' && (
            <p className="text-sm text-slate-500">
              회원이 쓴 글은 글 관리에 회원 이름과 함께 보이고, 관리자가 비공개로 바꾸거나 지울 수 있습니다. 한 회원은
              1시간에 10개까지 씁니다.
            </p>
          )}
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

/** 게시판 권한 (BM-10, T-150) */
export function BoardPermissionsSection({ boardId }: { boardId: string }) {
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <>
      {boardsQuery.isLoading && <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board?.system_key && <p className="text-sm text-slate-500">기본 게시판은 누구나 읽을 수 있고 권한을 바꿀 수 없습니다.</p>}
      {board && !board.system_key && <PermissionsForm key={board.id} board={board} />}
    </>
  )
}

/** 한 구역만 보는 화면 — 앱은 합친 화면(설정 · 필드 · 카테고리)을 쓴다 (T-212) */
export function BoardPermissionsPage() {
  const { boardId = '' } = useParams()
  return (
    <div className={PAGE}>
      <BoardDetailHeader boardId={boardId} />
      <BoardPermissionsSection boardId={boardId} />
    </div>
  )
}
