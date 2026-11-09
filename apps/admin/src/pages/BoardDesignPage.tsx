import { useState } from 'react'
import { useParams } from 'react-router'
import type { Board, BoardDesign, BoardSortOrder, BoardType } from '@cms/types'
import { Button, Toggle, toast } from '@cms/ui'
import { PublicColumnLayoutSettings } from '@/components/boards/PublicColumnLayoutSettings'
import { BoardListFieldSettings } from '@/components/boards/BoardListFieldSettings'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoards, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { BOARD_TYPES } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'

const SORT_OPTIONS: { value: BoardSortOrder; label: string }[] = [
  { value: 'LATEST', label: '최신순' },
  { value: 'OLDEST', label: '오래된순' },
  { value: 'TITLE', label: '제목순' },
]
const PAGE_SIZES = [10, 20, 30]
const COLUMNS: BoardDesign['columns'][] = [2, 3, 4]
const RATIOS: BoardDesign['image_ratio'][] = ['1:1', '4:3', '16:9']
const SELECT_CLASS = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-slate-700'
const CARD_CLASS = 'space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm'

function BoardDesignForm({ board }: { board: Board }) {
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const [boardType, setBoardType] = useState<BoardType>(board.board_type)
  const [design, setDesign] = useState<BoardDesign>(board.design)
  const [sortOrder, setSortOrder] = useState(board.sort_order)
  const [pageSize, setPageSize] = useState(board.page_size)

  const isSystem = board.system_key !== null
  // 사진 없는 글은 갤러리에서 빈 칸으로 보일 수 있다 (D-03)
  const typeWarning = boardType !== board.board_type && board.post_count > 0
  const usesImage = boardType === 'GALLERY' || boardType === 'CARD'
  const change = (next: Partial<BoardDesign>) => setDesign((current) => ({ ...current, ...next }))

  const save = async () => {
    try {
      await updateBoard.mutateAsync({
        id: board.id,
        payload: {
          sort_order: sortOrder,
          page_size: pageSize,
          // 기본 게시판은 화면이 템플릿 페이지라 정렬 · 글 수만 쓴다
          ...(isSystem ? {} : { board_type: boardType, design }),
        },
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
        {!isSystem && (
          <div className={`mb-5 ${CARD_CLASS}`}>
            <fieldset>
              <legend className={LABEL_CLASS}>표시 유형</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {BOARD_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
                      boardType === type.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="board-type"
                      className="mt-0.5"
                      checked={boardType === type.value}
                      onChange={() => setBoardType(type.value)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">{type.label}</span>
                      <span className="mt-0.5 block text-slate-500">{type.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {typeWarning && (
              <p className="text-sm text-amber-700">
                이미 쓴 글은 그대로 남습니다. 사진 없는 글은 갤러리형에서 빈 칸으로 보일 수
                있습니다.
              </p>
            )}

            {boardType === 'LIST' && (
              <div>
                <label htmlFor="board-list-layout" className={LABEL_CLASS}>
                  홈페이지 추가 정보 표시
                </label>
                <select
                  id="board-list-layout"
                  className={SELECT_CLASS}
                  value={design.list_layout ?? 'inline'}
                  onChange={(event) =>
                    change({ list_layout: event.target.value === 'columns' ? 'columns' : 'inline' })
                  }
                >
                  <option value="inline">제목 아래</option>
                  <option value="columns">표의 개별 열</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  홈페이지 표시와 목록 표시를 켠 칸만 나옵니다. 저장하면 홈페이지에 바로 적용됩니다.
                </p>
              </div>
            )}

            {boardType === 'LIST' && design.list_layout === 'columns' && (
              <PublicColumnLayoutSettings
                boardId={board.id}
                layout={design.list_column_layout ?? []}
                onChange={(layout) => change({ list_column_layout: layout })}
              />
            )}

            {usesImage && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="board-columns" className={LABEL_CLASS}>
                    PC 한 줄 개수
                  </label>
                  <select
                    id="board-columns"
                    className={SELECT_CLASS}
                    value={design.columns}
                    onChange={(e) =>
                      change({ columns: Number(e.target.value) as BoardDesign['columns'] })
                    }
                  >
                    {COLUMNS.map((count) => (
                      <option key={count} value={count}>
                        {count}개
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="board-ratio" className={LABEL_CLASS}>
                    사진 비율
                  </label>
                  <select
                    id="board-ratio"
                    className={SELECT_CLASS}
                    value={design.image_ratio}
                    onChange={(e) =>
                      change({ image_ratio: e.target.value as BoardDesign['image_ratio'] })
                    }
                  >
                    {RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {boardType === 'CARD' && (
              <div className="space-y-4">
                <Toggle
                  label="사진 표시"
                  checked={design.show_image}
                  onChange={(e) => change({ show_image: e.target.checked })}
                />
                <Toggle
                  label="요약 표시"
                  description="본문 앞부분을 보여 줍니다."
                  checked={design.show_summary}
                  onChange={(e) => change({ show_summary: e.target.checked })}
                />
                <p className="text-xs text-slate-500">아래에서 고른 추가 정보도 카드에 나옵니다.</p>
              </div>
            )}
            {boardType === 'FAQ' ? (
              <div className="space-y-4">
                <Toggle
                  label="한 번에 하나만 펼치기"
                  checked={design.faq_single_open}
                  onChange={(e) => change({ faq_single_open: e.target.checked })}
                />
                <Toggle
                  label="첫 질문을 펼쳐 두기"
                  checked={design.faq_first_open}
                  onChange={(e) => change({ faq_first_open: e.target.checked })}
                />
              </div>
            ) : (
              <Toggle
                label="작성일 표시"
                checked={design.show_date}
                onChange={(e) => change({ show_date: e.target.checked })}
              />
            )}
          </div>
        )}

        {!isSystem && <BoardListFieldSettings boardId={board.id} />}

        <div className={CARD_CLASS}>
          <h2 className="text-sm font-semibold text-slate-900">목록 표시</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="board-sort" className={LABEL_CLASS}>
                기본 정렬
              </label>
              <select
                id="board-sort"
                className={SELECT_CLASS}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as BoardSortOrder)}
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="board-page-size" className={LABEL_CLASS}>
                페이지당 글 수
              </label>
              <select
                id="board-page-size"
                className={SELECT_CLASS}
                value={pageSize ?? ''}
                onChange={(e) => setPageSize(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">자동 (유형에 맞게)</option>
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}개
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">상단 고정 글은 정렬과 관계없이 맨 위에 나옵니다.</p>
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
  )
}

/** 게시판 디자인 (BM-08) — 저장하면 홈페이지에 바로 반영된다. 초안 · 발행은 후속 */
export function BoardDesignPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {boardsQuery.isError && <p className="text-sm text-red-600">게시판을 불러오지 못했습니다.</p>}
      {boardsQuery.isSuccess && !board && (
        <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>
      )}
      {board && <BoardDesignForm key={board.id} board={board} />}
    </div>
  )
}
