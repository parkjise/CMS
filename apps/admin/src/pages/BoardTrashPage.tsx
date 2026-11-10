import dayjs from 'dayjs'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Button, toast } from '@cms/ui'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { HELP_STRIP, LIST_CARD, PAGE, TD, TH } from '@/components/boards/boardStyles'
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

  const boards = trashQuery.data ?? []
  return (
    <div className={PAGE}>
      <BoardPageTitle
        title="휴지통"
        description="지운 게시판을 복원할 수 있어요. 지운 글은 게시글 관리에서 상태를 '휴지통'으로 골라 복원하세요."
      />

      {trashQuery.isError && <p className="text-sm text-red-600">휴지통을 불러오지 못했습니다.</p>}
      {trashQuery.isLoading && <div className="h-32 animate-pulse rounded-xl bg-slate-100" />}
      {trashQuery.isSuccess && (
        <section className={LIST_CARD} aria-label="삭제된 게시판">
          <h2 className="border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-800">
            삭제된 게시판 ({boards.length})
          </h2>
          {boards.length === 0 ? (
            <p className="p-12 text-center text-sm text-slate-500">휴지통이 비어 있습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className={`${TH} pl-6`}>이름 / 주소</th>
                    <th className={TH}>게시글</th>
                    <th className={TH}>삭제일</th>
                    <th className={TH}>관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {boards.map((board) => (
                    <tr key={board.id}>
                      <td className={`${TD} pl-6`}>
                        <p className="font-medium text-slate-800">{board.name}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">{board.slug}</p>
                      </td>
                      <td className={`${TD} text-slate-600`}>
                        글 {board.post_count.toLocaleString()}개
                      </td>
                      <td className={`${TD} whitespace-nowrap text-xs text-slate-500`}>
                        {board.deleted_at
                          ? `${dayjs(board.deleted_at).format('YYYY.MM.DD')} 삭제`
                          : '-'}
                      </td>
                      <td className={TD}>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => restore(board.id)}
                          >
                            복원
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className={HELP_STRIP}>
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          지운 글은 게시글 관리에서 상태를 &lsquo;휴지통&rsquo;으로 골라 복원할 수 있어요.
        </span>
        <Link
          to="/admin/posts"
          className="ml-auto whitespace-nowrap font-medium text-blue-600 hover:underline"
        >
          게시글 관리 →
        </Link>
      </div>
    </div>
  )
}
