import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { Board, BoardSortOrder } from '@cms/types'
import { Button, Input, Textarea, Toggle, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useBoards, useDeleteBoard, useDuplicateBoard, useUpdateBoard } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'

const SORT_OPTIONS: { value: BoardSortOrder; label: string }[] = [
  { value: 'LATEST', label: '최신순' },
  { value: 'OLDEST', label: '오래된순' },
  { value: 'TITLE', label: '제목순' },
]
const PAGE_SIZES = [10, 20, 30]
const SELECT_CLASS = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'

function BoardSettingsForm({ board }: { board: Board }) {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const updateBoard = useUpdateBoard()
  const duplicateBoard = useDuplicateBoard()
  const deleteBoard = useDeleteBoard()
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description)
  const [sortOrder, setSortOrder] = useState(board.sort_order)
  const [pageSize, setPageSize] = useState(board.page_size)
  const [seoTitle, setSeoTitle] = useState(board.seo_title)
  const [seoDescription, setSeoDescription] = useState(board.seo_description)
  const [seoIndex, setSeoIndex] = useState(board.seo_index)
  const [nameError, setNameError] = useState<string>()

  const isSystem = board.system_key !== null

  const save = async () => {
    const error = name.trim() ? undefined : '이름을 입력해주세요.'
    setNameError(error)
    if (error) return
    try {
      await updateBoard.mutateAsync({
        id: board.id,
        payload: {
          name: name.trim(),
          description: description.trim(),
          sort_order: sortOrder,
          page_size: pageSize,
          // 기본 게시판은 화면이 템플릿 페이지라 검색 설정을 쓰지 않는다
          ...(isSystem
            ? {}
            : { seo_title: seoTitle.trim(), seo_description: seoDescription.trim(), seo_index: seoIndex }),
        },
      })
      toast.success('저장했습니다.')
    } catch (err) {
      toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
    }
  }

  const duplicate = async () => {
    try {
      const copy = await duplicateBoard.mutateAsync(board.id)
      toast.success('설정과 칸을 복제했습니다. 글은 복제되지 않습니다.')
      navigate(`/admin/boards/${copy.id}/settings`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '복제하지 못했습니다.'))
    }
  }

  const remove = async () => {
    const posts = board.post_count > 0 ? `글 ${board.post_count.toLocaleString()}개도 함께 보이지 않게 되고, ` : ''
    if (!window.confirm(`'${board.name}' 을(를) 휴지통으로 옮길까요? ${posts}홈페이지 메뉴와 주소에서 빠집니다.`)) return
    try {
      await deleteBoard.mutateAsync(board.id)
      toast.success('휴지통으로 옮겼습니다.')
      navigate('/admin/boards')
    } catch (error) {
      toast.error(pickErrorMessage(error, '삭제하지 못했습니다.'))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
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
              error={nameError}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              label="설명 (선택)"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">목록 표시</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="board-sort" className="mb-1 block text-sm font-medium text-slate-700">
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
                <label htmlFor="board-page-size" className="mb-1 block text-sm font-medium text-slate-700">
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

          {!isSystem && (
            <div className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">검색 노출</h2>
              <Toggle
                label="검색 결과에 표시"
                description="끄면 이 게시판과 글이 검색 대상과 사이트맵에서 빠집니다. 주소로는 그대로 열립니다."
                checked={seoIndex}
                onChange={(e) => setSeoIndex(e.target.checked)}
              />
              <Input
                label="검색 제목 (선택)"
                maxLength={60}
                placeholder={board.name}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
              <Textarea
                label="검색 설명 (선택)"
                rows={2}
                maxLength={160}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </div>
          )}
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

/** 기본 정보 (BM-03) — 유형 · 주소 · 사용 여부는 홈페이지 연결 탭 */
export function BoardSettingsPage() {
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
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board && <BoardSettingsForm key={board.id} board={board} />}
    </div>
  )
}
