import { useState } from 'react'
import dayjs from 'dayjs'
import { Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Button, toast } from '@cms/ui'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { PurgeBoardDialog } from '@/components/boards/PurgeBoardDialog'
import { TrashPostsSection } from '@/components/boards/TrashPostsSection'
import { HELP_STRIP, LIST_CARD, PAGE, TD, TH } from '@/components/boards/boardStyles'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useRestoreBoard, useTrashedBoards } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'
import { TRASH_RETENTION_DAYS, purgeLabel } from '@/lib/trash'

type TrashTab = 'boards' | 'posts'

/** 휴지통 (BM-07) — 지운 게시판 · 글을 한 곳에서 (T-209), 30일 뒤 자동 영구 삭제 (D-06, T-196) */
export function BoardTrashPage() {
  const canEdit = useCanEdit()
  // ?tab=posts — 글 관리 화면에서 바로 글 탭으로
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TrashTab = searchParams.get('tab') === 'posts' ? 'posts' : 'boards'
  const trashQuery = useTrashedBoards()
  const restoreBoard = useRestoreBoard()
  // 영구 삭제 확인 창의 게시판 (T-228)
  const [purging, setPurging] = useState<{ id: string; name: string } | null>(null)

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
        description={`지운 게시판과 글을 복원할 수 있어요. 휴지통에 넣은 지 ${TRASH_RETENTION_DAYS}일이 지나면 자동으로 영구 삭제돼요.`}
      />

      <nav aria-label="휴지통 종류" className="flex gap-4 border-b border-slate-200">
        {(
          [
            ['boards', '게시판'],
            ['posts', '글'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setSearchParams(key === 'posts' ? { tab: 'posts' } : {})}
            className={`-mb-px border-b-2 px-1 py-3 text-sm ${
              tab === key
                ? 'border-blue-600 font-semibold text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'posts' && <TrashPostsSection />}

      {tab === 'boards' && trashQuery.isError && (
        <p className="text-sm text-red-600">휴지통을 불러오지 못했습니다.</p>
      )}
      {tab === 'boards' && trashQuery.isLoading && (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      )}
      {tab === 'boards' && trashQuery.isSuccess && (
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
                    <th className={TH}>영구 삭제</th>
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
                        {board.deleted_by && (
                          <p className="mt-0.5 text-slate-400">{board.deleted_by}</p>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-xs text-amber-700`}>
                        {purgeLabel(board) ?? '-'}
                      </td>
                      <td className={TD}>
                        {canEdit && (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => restore(board.id)}
                            >
                              복원
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => setPurging({ id: board.id, name: board.name })}
                            >
                              영구 삭제
                            </Button>
                          </div>
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
          게시판을 영구 삭제하면 안의 글 · 필드 · 카테고리도 함께 지워져요. 글만 지운 것은 [글] 탭에
          있어요.
        </span>
      </div>
      <PurgeBoardDialog board={purging} onClose={() => setPurging(null)} />
    </div>
  )
}
