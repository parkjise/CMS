import { useState } from 'react'
import type { BoardCategory } from '@cms/types'
import { Button, Modal, toast } from '@cms/ui'
import { useMergeCategories } from '@/hooks/useBoardCategories'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'

interface BulkMergeCategoriesDialogProps {
  boardId: string
  categories: BoardCategory[]
  onClose: () => void
}

export const BulkMergeCategoriesDialog = ({
  boardId,
  categories,
  onClose,
}: BulkMergeCategoriesDialogProps) => {
  const canEdit = useCanEdit()
  const merge = useMergeCategories(boardId)
  const [selected, setSelected] = useState<string[]>([])
  const [targetId, setTargetId] = useState('')
  const available = categories.filter((category) => category.board_id === boardId)
  const sources = available.filter((category) => selected.includes(category.id))
  const targets = available.filter((category) => !selected.includes(category.id))
  const target = targets.find((category) => category.id === targetId)
  const changed = sources.length !== selected.length
  const ready = canEdit && !changed && sources.length >= 2 && sources.length <= 29 && target
  const close = () => {
    if (!merge.isPending) onClose()
  }
  const submit = () => {
    if (!ready || !target || merge.isPending) return
    merge.mutate(
      { source_ids: sources.map((category) => category.id), target_id: target.id },
      {
        onSuccess: ({ merged, moved }) => {
          toast.success(
            `카테고리 ${merged}개를 합치고 글 ${moved.toLocaleString()}개를 옮겼습니다.`
          )
          onClose()
        },
        onError: (error) => toast.error(pickErrorMessage(error, '카테고리를 합치지 못했습니다.')),
      }
    )
  }
  return (
    <Modal open onClose={close} title="여러 카테고리 합치기" closeOnBackdrop={!merge.isPending}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-700">
          원본을 2~29개 고른 뒤 대상을 확인해 주세요. 모든 원본의 글(휴지통 포함)을 대상으로 옮기고
          원본 카테고리를 삭제합니다. 글 내용과 공개 상태는 유지됩니다. 일부만 처리하지 않습니다. 이
          목록에는 검색 조건과 관계없이 게시판의 모든 카테고리가 표시됩니다.
        </p>
        <fieldset disabled={!canEdit || merge.isPending}>
          <legend className="mb-2 text-sm font-medium">합칠 원본 ({selected.length}개 선택)</legend>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
            {available.map((category) => (
              <label key={category.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(category.id)}
                  disabled={selected.length >= 29 && !selected.includes(category.id)}
                  onChange={(event) => {
                    setSelected((ids) =>
                      event.target.checked
                        ? [...ids, category.id]
                        : ids.filter((id) => id !== category.id)
                    )
                    if (event.target.checked && targetId === category.id) setTargetId('')
                  }}
                />
                <span>
                  {category.name}
                  {category.is_active ? '' : ' (홈페이지에서 숨김)'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {changed && (
          <p role="alert" className="text-sm text-red-600">
            선택한 카테고리가 바뀌었습니다. 닫은 뒤 다시 선택해 주세요.
          </p>
        )}
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">합칠 대상</span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={targetId}
            disabled={!canEdit || merge.isPending}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">카테고리를 선택하세요</option>
            {targets.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.is_active ? '' : ' (홈페이지에서 숨김)'}
              </option>
            ))}
          </select>
        </label>
        {target && sources.length > 0 && (
          <p className="break-words text-sm text-slate-700">
            {sources.map((category) => category.name).join(', ')} → {target.name}
          </p>
        )}
        {target && !target.is_active && (
          <p className="text-sm text-amber-700">
            대상은 홈페이지 분류 탭에서 숨겨져 있습니다. 글은 ‘전체’에 계속 표시됩니다.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={merge.isPending} onClick={close}>
            취소
          </Button>
          <Button type="button" loading={merge.isPending} disabled={!ready} onClick={submit}>
            선택한 카테고리 합치기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
