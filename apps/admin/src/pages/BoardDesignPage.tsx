import { useState } from 'react'
import { useParams } from 'react-router'
import type { Board, BoardDesign, BoardSortOrder, BoardType } from '@cms/types'
import { Button, Toggle, toast } from '@cms/ui'
import { PublicColumnLayoutSettings } from '@/components/boards/PublicColumnLayoutSettings'
import { BoardListFieldSettings } from '@/components/boards/BoardListFieldSettings'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { BoardDesignPreview } from '@/components/boards/BoardDesignPreview'
import { CARD, HELP_STRIP, PAGE, PANEL_LABEL } from '@/components/boards/boardStyles'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useBoardTypeOptions, useBoards, useUpdateBoard } from '@/hooks/useBoards'
import { useCanEdit } from '@/hooks/useCanEdit'
import { BOARD_TYPES, boardTypeLabel } from '@/lib/boardLabels'
import { pickErrorMessage } from '@/lib/errorMessages'

const SORT_OPTIONS: { value: BoardSortOrder; label: string }[] = [
  { value: 'LATEST', label: '최신순' },
  { value: 'OLDEST', label: '오래된순' },
  { value: 'TITLE', label: '제목순' },
]
const PAGE_SIZES = [10, 20, 30]
const COLUMNS: BoardDesign['columns'][] = [2, 3, 4]
const RATIOS: BoardDesign['image_ratio'][] = ['1:1', '4:3', '16:9']
const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-slate-600'
const CARD_CLASS = `space-y-4 ${CARD}`
const SUMMARY_LENGTHS = [60, 120, 200] as const
// 목록 위아래 표시 (T-220) — 저장 전 게시판은 값이 없어 켜짐으로 본다
const DISPLAY_OPTIONS: {
  key: 'show_pin_badge' | 'show_total' | 'show_search' | 'show_pagination'
  label: string
  description?: string
}[] = [
  {
    key: 'show_pin_badge',
    label: '공지 배지',
    description: '상단 고정 글 제목 앞에 [공지]를 붙입니다.',
  },
  { key: 'show_total', label: '전체 글 수' },
  { key: 'show_search', label: '검색창' },
  {
    key: 'show_pagination',
    label: '페이지 번호',
    description: '끄면 첫 페이지 글만 보입니다.',
  },
]

/** 유형 카드의 작은 모양 — 목록은 줄, 사진 유형은 칸, 웹진은 왼쪽 사진 + 줄 */
function TypeSketch({ type }: { type: BoardType }) {
  const tiles = type === 'GALLERY' || type === 'CARD'
  if (type === 'REVIEW') {
    return (
      <span aria-hidden className="mb-2 flex h-11 flex-col gap-1 rounded bg-slate-100 p-2">
        <i className="text-[9px] not-italic leading-none tracking-widest text-amber-400">★★★★★</i>
        <i className="h-1 w-full rounded-sm bg-slate-300" />
        <i className="h-1 w-2/3 rounded-sm bg-slate-300" />
      </span>
    )
  }
  if (type === 'WEBZINE') {
    return (
      <span aria-hidden className="mb-2 flex h-11 gap-1.5 rounded bg-slate-100 p-2">
        <i className="h-full w-9 rounded-sm bg-slate-300" />
        <span className="flex flex-1 flex-col gap-1">
          <i className="h-1 w-full rounded-sm bg-slate-300" />
          <i className="h-1 w-2/3 rounded-sm bg-slate-300" />
        </span>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`mb-2 flex h-11 gap-1 rounded bg-slate-100 p-2 ${tiles ? 'flex-row' : 'flex-col'}`}
    >
      {[0, 1, 2].map((bar) => (
        <i
          key={bar}
          className={`rounded-sm bg-slate-300 ${tiles ? 'h-full flex-1' : `h-1 ${bar === 1 ? 'w-2/3' : bar === 2 ? 'w-5/6' : 'w-full'}`}`}
        />
      ))}
    </span>
  )
}

function BoardDesignForm({ board }: { board: Board }) {
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const [boardType, setBoardType] = useState<BoardType>(board.board_type)
  const [design, setDesign] = useState<BoardDesign>(board.design)
  const [sortOrder, setSortOrder] = useState(board.sort_order)
  const [pageSize, setPageSize] = useState(board.page_size)
  const payload = { sort_order: sortOrder, page_size: pageSize, board_type: boardType, design }
  // 마지막으로 저장한 값 — 바꾼 게 없으면 저장 버튼을 끈다
  const [saved, setSaved] = useState(() =>
    JSON.stringify({
      sort_order: board.sort_order,
      page_size: board.page_size,
      board_type: board.board_type,
      design: board.design,
    })
  )
  const dirty = JSON.stringify(payload) !== saved

  const isSystem = board.system_key !== null
  // 사진 없는 글은 갤러리에서 빈 칸으로 보일 수 있다 (D-03)
  const typeWarning = boardType !== board.board_type && board.post_count > 0
  const usesImage = boardType === 'GALLERY' || boardType === 'CARD'
  const typeOptions = useBoardTypeOptions().data
  // 기본 게시판(공지)은 필드 추가 · 방문자 글쓰기가 없어 리뷰형 · 문의형도 막는다 (T-220)
  const blockedTypes = {
    ...typeOptions?.blocked,
    ...(isSystem ? typeOptions?.system_blocked : {}),
  }
  const change = (next: Partial<BoardDesign>) => setDesign((current) => ({ ...current, ...next }))

  // 성공 여부를 돌려준다 — 나가기 확인의 [저장하고 이동] (T-227)
  const save = async () => {
    try {
      await updateBoard.mutateAsync({ id: board.id, payload })
      setSaved(JSON.stringify(payload))
      toast.success('저장했습니다.')
      return true
    } catch (err) {
      toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
      return false
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <form
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <LeaveGuard dirty={dirty} onSave={save} />
        <ReadOnlyFieldset>
          {isSystem && (
            <p className={`mb-5 ${HELP_STRIP}`}>
              기본 게시판도 유형과 표시 방식을 바꿀 수 있어요. 필드 · 방문자 글쓰기가 없어 리뷰형 ·
              문의형은 쓸 수 없어요.
              {board.has_samples &&
                ' 공지를 처음 공개하기 전에는 홈페이지에 샘플 공지가 목록형으로 보여요.'}
            </p>
          )}
          <div className={`mb-5 ${CARD_CLASS}`}>
            <fieldset>
              <legend className={PANEL_LABEL}>레이아웃 유형</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {BOARD_TYPES.map((type) => {
                  // 병원 업종은 리뷰형으로 바꿀 수 없다 — 서버도 막는다 (T-218)
                  const blocked = type.value !== board.board_type && blockedTypes[type.value]
                  return (
                    <label
                      key={type.value}
                      title={blocked || type.hint}
                      className={`relative rounded-lg border p-3 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                        blocked
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                          : boardType === type.value
                            ? 'cursor-pointer border-blue-600 bg-blue-50/60'
                            : 'cursor-pointer border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="board-type"
                        className="sr-only"
                        checked={boardType === type.value}
                        disabled={Boolean(blocked)}
                        onChange={() => setBoardType(type.value)}
                      />
                      <TypeSketch type={type.value} />
                      <span className="block font-medium text-slate-800">{type.label}</span>
                      {boardType === type.value && (
                        <span aria-hidden className="absolute right-2 top-1.5 text-blue-600">
                          ✓
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {BOARD_TYPES.find((type) => type.value === boardType)?.hint}
              </p>
              {Object.entries(blockedTypes)
                .filter(([type]) => type !== board.board_type)
                .map(([type, reason]) => (
                  <p key={type} className="mt-1 text-xs text-amber-700">
                    {boardTypeLabel(type)}: {reason}
                  </p>
                ))}
            </fieldset>
            {typeWarning && (
              <p className="text-sm text-amber-700">
                이미 쓴 글은 그대로 남습니다. 사진 없는 글은 갤러리형에서 빈 칸으로 보일 수
                있습니다.
              </p>
            )}

            {/* 기본 게시판은 필드가 없어 추가 정보 표시가 없다 */}
            {boardType === 'LIST' && !isSystem && (
              <div>
                <label htmlFor="board-list-layout" className={LABEL_CLASS}>
                  홈페이지 추가 정보 표시
                </label>
                <select
                  id="board-list-layout"
                  className={SELECT_CLASS}
                  value={design.list_layout ?? 'inline'}
                  onChange={(event) =>
                    change({
                      list_layout: event.target.value === 'columns' ? 'columns' : 'inline',
                    })
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

            {boardType === 'LIST' && !isSystem && design.list_layout === 'columns' && (
              <PublicColumnLayoutSettings
                boardId={board.id}
                layout={design.list_column_layout ?? []}
                onChange={(layout) => change({ list_column_layout: layout })}
              />
            )}

            {(usesImage || boardType === 'WEBZINE') && (
              <div className="grid gap-4 sm:grid-cols-2">
                {/* 웹진형은 한 줄에 글 하나 — 사진 비율만 (T-217) */}
                {usesImage && (
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
                )}
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
            {(boardType === 'CARD' || boardType === 'WEBZINE') && (
              // 스위치는 inline-flex — 세로로 쌓는다
              <div className="flex flex-col items-start gap-4">
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
                {boardType === 'WEBZINE' && design.show_summary && (
                  <div className="w-full">
                    <label htmlFor="board-summary-length" className={LABEL_CLASS}>
                      요약 길이
                    </label>
                    <select
                      id="board-summary-length"
                      className={SELECT_CLASS}
                      value={design.summary_length ?? 120}
                      onChange={(e) =>
                        change({
                          summary_length: Number(e.target.value) as BoardDesign['summary_length'],
                        })
                      }
                    >
                      {SUMMARY_LENGTHS.map((length) => (
                        <option key={length} value={length}>
                          {length}자
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!isSystem && (
                  <p className="text-xs text-slate-500">
                    {boardType === 'CARD'
                      ? '아래에서 고른 추가 정보도 카드에 나옵니다.'
                      : '아래에서 고른 추가 정보도 제목 아래에 나옵니다.'}
                  </p>
                )}
              </div>
            )}
            {boardType === 'REVIEW' && (
              <div className="flex flex-col items-start gap-4">
                <Toggle
                  label="요약 표시"
                  description="후기 본문 앞부분을 보여 줍니다."
                  checked={design.show_summary}
                  onChange={(e) => change({ show_summary: e.target.checked })}
                />
                <p className="text-xs text-slate-500">
                  목록 위에 평균 별점과 후기 수가 나오고, 글마다 별점이 보입니다.
                </p>
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

          {!isSystem && <BoardListFieldSettings boardId={board.id} />}

          <div className={CARD_CLASS}>
            <h2 className={PANEL_LABEL}>목록 표시</h2>
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
            <p className="text-xs text-slate-500">
              상단 고정 글은 정렬과 관계없이 맨 위에 나옵니다.
            </p>
            <fieldset className="flex flex-col items-start gap-4 border-t border-slate-100 pt-4">
              <legend className="mb-3 text-xs font-medium text-slate-600">표시 옵션</legend>
              {DISPLAY_OPTIONS.filter(
                // FAQ형은 고정 글 배지를 그리지 않는다
                ({ key }) => !(key === 'show_pin_badge' && boardType === 'FAQ')
              ).map(({ key, label, description }) => (
                <Toggle
                  key={key}
                  label={label}
                  description={description}
                  checked={design[key] !== false}
                  onChange={(e) => change({ [key]: e.target.checked })}
                />
              ))}
            </fieldset>
          </div>
        </ReadOnlyFieldset>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" loading={updateBoard.isPending} disabled={!dirty}>
              저장
            </Button>
          </div>
        )}
      </form>
      <div className="min-w-0 space-y-4 xl:sticky xl:top-6">
        <BoardDesignPreview name={board.name} type={boardType} design={design} />
        <p className={HELP_STRIP}>
          색상과 글꼴은 사이트 디자인을 따릅니다. 저장하면 홈페이지에 바로 반영돼요.
        </p>
      </div>
    </div>
  )
}

/** 게시판 디자인 (BM-08) — 저장하면 홈페이지에 바로 반영된다. 초안 · 발행은 후속 */
export function BoardDesignPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

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
      {board && <BoardDesignForm key={board.id} board={board} />}
    </div>
  )
}
