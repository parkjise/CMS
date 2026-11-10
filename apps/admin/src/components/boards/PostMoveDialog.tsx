import { useEffect, useState } from 'react'
import type { PostMovePreview, PostMoveResult } from '@cms/types'
import { Button, Modal, toast } from '@cms/ui'
import { useBoardCategories } from '@/hooks/useBoardCategories'
import { useBoards, useMovePosts, usePostMovePreview } from '@/hooks/useBoards'
import { categoryLabel, orderTree } from '@/lib/categoryTree'
import { pickErrorMessage } from '@/lib/errorMessages'

interface PostMoveDialogProps {
  postIds: string[]
  /** 글이 모두 한 게시판에 있으면 그 게시판 — 받을 곳 목록에서 뺀다 */
  fromBoardId?: string
  /** 화면마다 덧붙일 안내 — 글 수정 화면의 저장 안 한 내용 등 */
  note?: string
  onClose: () => void
  onMoved: (result: PostMoveResult, targetBoardId: string) => void
}

const fieldList = (items: PostMovePreview['carried']) =>
  items.map((item) => `${item.label}(${item.posts.toLocaleString()}개)`).join(', ')

/**
 * 다른 게시판으로 글 옮기기 (T-184, 기획서 BM-05) — 고르면 바로 미리보기를 보여 주고,
 * 미리보기와 같은 계산으로 옮긴다. 옮길 수 없는 글이 하나라도 있으면 옮기지 않는다.
 */
export function PostMoveDialog({
  postIds,
  fromBoardId,
  note,
  onClose,
  onMoved,
}: PostMoveDialogProps) {
  const boards = (useBoards().data ?? []).filter((board) => board.id !== fromBoardId)
  const [targetId, setTargetId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const target = boards.find((board) => board.id === targetId)
  // 기본 게시판(공지)에는 분류가 없다
  const hasCategories = Boolean(target && !target.system_key)
  const categoriesQuery = useBoardCategories(targetId, { enabled: hasCategories })
  const categories = hasCategories ? (categoriesQuery.data ?? []) : []
  const preview = usePostMovePreview()
  const move = useMovePosts()
  const { mutate: runPreview, reset: resetPreview } = preview
  // 부르는 쪽이 매번 새 배열을 넘겨도 미리보기를 다시 부르지 않게
  const idsKey = postIds.join(',')

  useEffect(() => {
    if (!targetId) {
      resetPreview()
      return
    }
    runPreview({ post_ids: idsKey.split(','), target_board_id: targetId, category_id: null })
  }, [targetId, idsKey, runPreview, resetPreview])

  const result = preview.data
  const ready = Boolean(result && result.blocked_count === 0 && !preview.isPending)

  const submit = () => {
    move.mutate(
      { post_ids: postIds, target_board_id: targetId, category_id: categoryId || null },
      {
        onSuccess: (moved) => {
          toast.success(
            `글 ${moved.moved.toLocaleString()}개를 '${target?.name}'(으)로 옮겼습니다.`
          )
          onMoved(moved, targetId)
        },
        onError: (error) =>
          toast.error(pickErrorMessage(error, '옮기지 못했습니다. 아무 글도 바뀌지 않았습니다.')),
      }
    )
  }

  return (
    <Modal open onClose={move.isPending ? () => undefined : onClose} title="다른 게시판으로 옮기기">
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          고른 글 {postIds.length.toLocaleString()}개를 다른 게시판으로 옮깁니다. 상단 고정 · 공개
          상태 · 작성일은 그대로입니다.
          {note && ` ${note}`}
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">받을 게시판</span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={targetId}
            disabled={move.isPending}
            onChange={(e) => {
              setTargetId(e.target.value)
              setCategoryId('')
            }}
          >
            <option value="">선택하세요</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
                {board.status === 'INACTIVE' ? ' (비활성)' : ''}
              </option>
            ))}
          </select>
        </label>
        {hasCategories && (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">분류</span>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={categoryId}
              disabled={move.isPending || categoriesQuery.isPending}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">분류 없음</option>
              {orderTree(categories).map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabel(category, categories)}
                  {category.is_active ? '' : ' (숨김)'}
                </option>
              ))}
            </select>
          </label>
        )}

        {preview.isPending && <p className="text-sm text-slate-500">확인하는 중…</p>}
        {preview.isError && (
          <p role="alert" className="text-sm text-red-600">
            {pickErrorMessage(preview.error, '미리보기를 불러오지 못했습니다.')}
          </p>
        )}
        {result && !preview.isPending && (
          <div
            role="status"
            className="space-y-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700"
          >
            <p className="font-medium">
              글 {result.posts.toLocaleString()}개를 &lsquo;{result.target_name}&rsquo;(으)로
              옮깁니다.
            </p>
            {result.carried.length > 0 && <p>따라가는 칸 값: {fieldList(result.carried)}</p>}
            {result.dropped.length > 0 && (
              <p className="text-amber-800">
                받을 게시판에 같은 이름 · 유형의 칸이 없어 빠지는 값: {fieldList(result.dropped)}.
                빠진 값은 감사 기록에 남습니다.
              </p>
            )}
            {result.blocked_count > 0 && (
              <div className="text-red-700">
                <p>옮길 수 없는 글이 {result.blocked_count.toLocaleString()}개 있습니다.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {result.blocked.map((item) => (
                    <li key={item.post_id}>
                      {item.title} — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={move.isPending} onClick={onClose}>
            취소
          </Button>
          <Button type="button" loading={move.isPending} disabled={!ready} onClick={submit}>
            옮기기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
