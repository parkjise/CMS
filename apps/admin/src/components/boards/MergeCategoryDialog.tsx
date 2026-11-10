import { useState } from 'react'
import type { BoardCategory } from '@cms/types'
import { Button, Modal, toast } from '@cms/ui'
import { useDeleteCategory } from '@/hooks/useBoardCategories'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'
import { categoryLabel } from '@/lib/categoryTree'

interface MergeCategoryDialogProps {
  boardId: string
  source: BoardCategory
  categories: BoardCategory[]
  onClose: () => void
}

/** 기존 삭제/글 이동 API로 한 분류를 다른 분류에 합친다. 대상 선택은 필수다. */
export const MergeCategoryDialog = ({
  boardId,
  source,
  categories,
  onClose,
}: MergeCategoryDialogProps) => {
  const canEdit = useCanEdit()
  const merge = useDeleteCategory(boardId)
  const [destinationId, setDestinationId] = useState('')
  const candidates = categories.filter(
    (category) => category.id !== source.id && category.board_id === boardId
  )
  const destination = candidates.find((category) => category.id === destinationId)
  const close = () => {
    if (!merge.isPending) onClose()
  }
  const submit = () => {
    if (!canEdit || merge.isPending || !destination) return
    merge.mutate(
      { id: source.id, moveTo: destination.id },
      {
        onSuccess: (moved) => {
          toast.success(`카테고리를 합치고 글 ${moved.toLocaleString()}개를 옮겼습니다.`)
          onClose()
        },
        onError: (error) => toast.error(pickErrorMessage(error, '카테고리를 합치지 못했습니다.')),
      }
    )
  }
  return (
    <Modal
      open
      onClose={close}
      title="카테고리 합치기"
      size="sm"
      closeOnBackdrop={!merge.isPending}
    >
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-700">
          ‘{source.name}’의 글을 아래에서 고른 카테고리로 옮깁니다. 휴지통의 글도 함께 옮깁니다.
          원래 카테고리는 삭제되며, 글의 공개 상태와 내용은 유지됩니다.
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">합칠 대상</span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={destinationId}
            disabled={merge.isPending || !canEdit}
            onChange={(event) => setDestinationId(event.target.value)}
          >
            <option value="">카테고리를 선택하세요</option>
            {candidates.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category, categories)}
                {category.is_active ? '' : ' (홈페이지에서 숨김)'}
              </option>
            ))}
          </select>
        </label>
        {destination && (
          <p className="text-sm text-slate-700">
            ‘{source.name}’ → ‘{destination.name}’으로 합칩니다.
          </p>
        )}
        {destination && !destination.is_active && (
          <p className="text-sm text-amber-700">
            대상 카테고리는 홈페이지 분류 탭에서 숨겨져 있습니다. 글은 ‘전체’에 계속 표시됩니다.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={merge.isPending} onClick={close}>
            취소
          </Button>
          <Button
            type="button"
            loading={merge.isPending}
            disabled={!canEdit || !destination}
            onClick={submit}
          >
            합치기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
