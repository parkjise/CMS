import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Board, BoardType } from '@cms/types'
import { Button, Input, Textarea, Toggle, toast } from '@cms/ui'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useBoards, useDeleteBoard, useDuplicateBoard, useUpdateBoard } from '@/hooks/useBoards'
import { BOARD_TYPES, boardSlugError } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'

function BoardSettingsForm({ board }: { board: Board }) {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const duplicateBoard = useDuplicateBoard()
  const deleteBoard = useDeleteBoard()
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description)
  const [slug, setSlug] = useState(board.slug)
  const [boardType, setBoardType] = useState<BoardType>(board.board_type)
  const [active, setActive] = useState(board.status === 'ACTIVE')
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({})

  const isSystem = board.system_key !== null
  // 사진 없는 글은 갤러리에서 빈 칸으로 보일 수 있다 (D-03)
  const typeWarning = boardType !== board.board_type && board.post_count > 0

  const save = async () => {
    const next = {
      name: name.trim() ? undefined : '이름을 입력해주세요.',
      slug: boardSlugError(slug),
    }
    setErrors(next)
    if (next.name || next.slug) return
    try {
      await updateBoard.mutateAsync({
        id: board.id,
        payload: {
          name: name.trim(),
          description: description.trim(),
          slug,
          board_type: boardType,
          status: active ? 'ACTIVE' : 'INACTIVE',
        },
      })
      toast.success('저장했습니다.')
    } catch (error) {
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
    }
  }

  const duplicate = async () => {
    try {
      const copy = await duplicateBoard.mutateAsync(board.id)
      toast.success('설정을 복제했습니다. 글은 복제되지 않습니다.')
      navigate(`/admin/boards/${copy.id}/settings`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '복제하지 못했습니다.'))
    }
  }

  const remove = async () => {
    try {
      await deleteBoard.mutateAsync(board.id)
      toast.success('휴지통으로 옮겼습니다.')
      navigate('/admin/boards')
    } catch (error) {
      toast.error(pickErrorMessage(error, '삭제하지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <ReadOnlyFieldset>
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <Input
              label="게시판 이름"
              required
              maxLength={100}
              value={name}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              label="설명 (선택)"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Input
              label="주소 이름"
              maxLength={60}
              value={slug}
              error={errors.slug}
              disabled={isSystem}
              helperText={isSystem ? '기본 게시판의 주소는 바꿀 수 없습니다.' : undefined}
              onChange={(e) => setSlug(e.target.value)}
            />
            <div>
              <label htmlFor="board-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                유형
              </label>
              <select
                id="board-type"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
                value={boardType}
                disabled={isSystem}
                onChange={(e) => setBoardType(e.target.value as BoardType)}
              >
                {BOARD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {typeWarning && (
                <p className="mt-1.5 text-sm text-amber-700">
                  이미 쓴 글은 그대로 남습니다. 사진 없는 글은 갤러리형에서 빈 칸으로 보일 수 있습니다.
                </p>
              )}
            </div>
            <Toggle
              label="게시판 사용"
              description="끄면 홈페이지에서 글이 보이지 않습니다."
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </div>
        </ReadOnlyFieldset>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" loading={updateBoard.isPending}>
              저장
            </Button>
          </div>
        )}
      </form>

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" loading={duplicateBoard.isPending} onClick={duplicate}>
            복제
          </Button>
          {!isSystem && (
            <Button type="button" variant="ghost" loading={deleteBoard.isPending} onClick={remove}>
              휴지통으로
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** 게시판 설정 (BM-03) */
export function BoardSettingsPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 md:p-8">
      <div>
        <Link to="/admin/boards" className="text-sm text-slate-500 hover:text-slate-700">
          ← 게시판 관리
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">게시판 설정</h1>
      </div>

      {boardsQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board && <BoardSettingsForm key={board.id} board={board} />}
    </div>
  )
}
