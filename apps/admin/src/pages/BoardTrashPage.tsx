import dayjs from 'dayjs'
import { Link } from 'react-router'
import { Button, toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useRestoreBoard, useTrashedBoards } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'

/** 게시판 휴지통 (BM-07) — 자동 파기는 보관 기간(D-06)이 정해진 뒤 */
export function BoardTrashPage() {
  const canEdit = useCanEdit()
  const trashQuery = useTrashedBoards()
  const restoreBoard = useRestoreBoard()

  const restore = async (id: string) => {
    try {
      const { board, slug_changed: changed } = await restoreBoard.mutateAsync(id)
      if (changed) toast.info(`원래 주소를 다른 게시판이 쓰고 있어 ${board.slug} 로 복원했습니다.`)
      else toast.success('게시판을 복원했습니다.')
    } catch (error) {
      toast.error(pickErrorMessage(error, '복원하지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-5 p-6 md:p-8">
      <div>
        <Link to="/admin/boards" className="text-sm text-slate-500 hover:text-slate-700">
          ← 게시판 관리
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">게시판 휴지통</h1>
      </div>

      {trashQuery.isError && <p className="text-sm text-red-600">휴지통을 불러오지 못했습니다.</p>}
      {trashQuery.data?.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          휴지통이 비어 있습니다.
        </p>
      )}
      {trashQuery.data && trashQuery.data.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
          {trashQuery.data.map((board) => (
            <li key={board.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900">{board.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  글 {board.post_count.toLocaleString()}개
                  {board.deleted_at && ` · ${dayjs(board.deleted_at).format('YYYY.MM.DD')} 삭제`}
                </p>
              </div>
              {canEdit && (
                <Button type="button" variant="secondary" size="sm" onClick={() => restore(board.id)}>
                  복원
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
