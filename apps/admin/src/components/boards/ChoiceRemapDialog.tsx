import { useState } from 'react'
import type { BoardField, FieldOption } from '@cms/types'
import { Button, Modal, toast } from '@cms/ui'
import { useRemapChoice } from '@/hooks/useBoardFields'
import { pickErrorMessage } from '@/lib/errorMessages'

const CLEAR = '__clear__'

interface ChoiceRemapDialogProps {
  boardId: string
  /** 저장된 칸 — 옮길 곳은 저장된 선택지만 고를 수 있다 */
  field: BoardField
  source: FieldOption
  /** 지금 화면의 선택지 이름 — 저장 전 이름 바꾸기도 보여 준다 */
  labels: Record<string, string>
  /** 지우려다 연 경우 — 옮긴 뒤 화면에서 선택지를 뺀다 */
  removing: boolean
  onClose: () => void
  onMoved: () => void
}

/** 쓰고 있는 선택지 옮기기 (T-180, 기획서 8.4) — 휴지통 글까지 한 번에 바꾼다 */
export function ChoiceRemapDialog({
  boardId,
  field,
  source,
  labels,
  removing,
  onClose,
  onMoved,
}: ChoiceRemapDialogProps) {
  const remap = useRemapChoice(boardId)
  const [target, setTarget] = useState('')
  const count = field.choice_counts?.[source.value] ?? 0
  const name = (option: FieldOption) => labels[option.value] || option.label
  const targets = field.options.filter((option) => option.value !== source.value)
  const targetName =
    target === CLEAR ? '값 없음' : name(targets.find((o) => o.value === target) ?? source)

  const submit = () => {
    if (!target) return
    remap.mutate(
      { fieldId: field.id, source: source.value, target: target === CLEAR ? null : target },
      {
        onSuccess: (moved) => {
          toast.success(
            removing
              ? `글 ${moved.toLocaleString()}개를 옮겼습니다. [칸 저장]을 누르면 선택지가 지워집니다.`
              : `글 ${moved.toLocaleString()}개를 옮겼습니다.`,
          )
          onMoved()
        },
        onError: (error) => toast.error(pickErrorMessage(error, '옮기지 못했습니다.')),
      },
    )
  }

  return (
    <Modal open onClose={remap.isPending ? () => undefined : onClose} title="선택지 옮기기" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          {removing && '글에서 쓰고 있는 선택지라 바로 지울 수 없습니다. '}
          &lsquo;{name(source)}&rsquo;를 고른 글 {count.toLocaleString()}개(휴지통 글 포함)를 다른
          선택지로 옮깁니다.
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">옮길 곳</span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={target}
            disabled={remap.isPending}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">선택하세요</option>
            {targets.map((option) => (
              <option key={option.value} value={option.value}>
                {name(option)}
              </option>
            ))}
            <option value={CLEAR} disabled={field.is_required}>
              값 비우기{field.is_required ? ' (필수 칸이라 쓸 수 없음)' : ''}
            </option>
          </select>
        </label>
        {target && (
          <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            글 {count.toLocaleString()}개의 값이 &lsquo;{name(source)}&rsquo; → &lsquo;{targetName}
            &rsquo;(으)로 바뀝니다.
            {field.field_type === 'MULTI_SELECT' && ' 이미 고른 값과 겹치면 하나로 합칩니다.'}
            {target === CLEAR && ' 비운 값은 되돌릴 수 없습니다.'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={remap.isPending} onClick={onClose}>
            취소
          </Button>
          <Button type="button" loading={remap.isPending} disabled={!target} onClick={submit}>
            옮기기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
