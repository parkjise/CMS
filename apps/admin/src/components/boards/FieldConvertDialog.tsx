import { useState } from 'react'
import { Link } from 'react-router'
import type { BoardField, FieldType } from '@cms/types'
import { Button, Modal, toast } from '@cms/ui'
import { useConvertField, useFieldConvertPreview } from '@/hooks/useBoardFields'
import { FIELD_TYPES, fieldTypeLabel } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

/** 사진 칸은 이 유형으로만 바꿀 수 있고, 사진 칸으로는 바꿀 수 없다 (서버와 같게) */
const FROM_IMAGE: FieldType[] = ['TEXT', 'TEXTAREA', 'URL']

const targetsOf = (field: BoardField): FieldType[] =>
  FIELD_TYPES.map((t) => t.value).filter(
    (type) =>
      type !== field.field_type &&
      type !== 'IMAGE' &&
      (field.field_type !== 'IMAGE' || FROM_IMAGE.includes(type)),
  )

interface FieldConvertDialogProps {
  boardId: string
  field: BoardField
  onClose: () => void
  onConverted: () => void
}

/** 값이 있는 칸의 유형 바꾸기 (T-182, 기획서 8.4) — 미리보기로 결과를 본 뒤 바꾼다 */
export function FieldConvertDialog({ boardId, field, onClose, onConverted }: FieldConvertDialogProps) {
  const preview = useFieldConvertPreview(boardId)
  const convert = useConvertField(boardId)
  const [target, setTarget] = useState<FieldType | ''>('')
  const [clearFailed, setClearFailed] = useState(false)
  const result = preview.data?.field_type === target ? preview.data : undefined
  const busy = convert.isPending

  const pick = (next: FieldType | '') => {
    setTarget(next)
    setClearFailed(false)
    if (next) preview.mutate({ fieldId: field.id, fieldType: next })
  }

  const submit = () => {
    if (!target || !result) return
    convert.mutate(
      { fieldId: field.id, fieldType: target, clearFailed },
      {
        onSuccess: ({ converted, cleared }) => {
          toast.success(
            cleared > 0
              ? `유형을 바꿨습니다. 글 ${converted.toLocaleString()}개를 바꾸고 ${cleared.toLocaleString()}개는 비웠습니다.`
              : `유형을 바꿨습니다. 글 ${converted.toLocaleString()}개를 바꿨습니다.`,
          )
          onConverted()
        },
        onError: (error) => toast.error(pickErrorMessage(error, '유형을 바꾸지 못했습니다.')),
      },
    )
  }

  const blocked = Boolean(result && result.failed > 0 && !clearFailed)

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={`'${field.label}' 유형 바꾸기`} size="md">
      <div className="space-y-4 text-sm">
        <p className="text-slate-700">
          지금 유형은 &lsquo;{fieldTypeLabel(field.field_type)}&rsquo;입니다. 새 유형을 고르면 글{' '}
          {field.value_count.toLocaleString()}개(휴지통 글 포함)의 값이 어떻게 바뀌는지 먼저 보여
          드립니다.
        </p>
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-700">새 유형</span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3"
            value={target}
            disabled={busy}
            onChange={(e) => pick(e.target.value as FieldType | '')}
          >
            <option value="">선택하세요</option>
            {targetsOf(field).map((type) => (
              <option key={type} value={type}>
                {fieldTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>

        {target && preview.isPending && <p className="text-slate-500">미리보기를 만드는 중…</p>}
        {target && preview.isError && (
          <p role="alert" className="text-red-600">
            {pickErrorMessage(preview.error, '미리보기를 만들지 못했습니다.')}
          </p>
        )}

        {result && (
          <div className="space-y-3">
            <p role="status" className="rounded-md bg-slate-50 p-3 text-slate-800">
              글 {result.total.toLocaleString()}개 중 {result.convertible.toLocaleString()}개를 바꿀 수
              있습니다.
              {result.failed > 0 && ` ${result.failed.toLocaleString()}개는 바꿀 수 없습니다.`}
            </p>
            {result.samples.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-slate-700">바뀌는 예</p>
                <ul className="space-y-1" aria-label="바뀌는 예">
                  {result.samples.map((s) => (
                    <li key={s.post_id} className="break-words text-slate-600">
                      {s.title}: &lsquo;{s.before}&rsquo; → &lsquo;{s.after}&rsquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.choices.length > 0 && (
              <p className="text-slate-600">
                선택지: {result.choices.map((c) => c.label).join(', ')}
              </p>
            )}
            {!result.default_value_kept && (
              <p className="text-slate-600">기본값은 새 유형으로 바꿀 수 없어 비워집니다.</p>
            )}
            {result.failed > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="mb-1 font-medium text-amber-900">바꿀 수 없는 글</p>
                <ul className="space-y-1" aria-label="바꿀 수 없는 글">
                  {result.failures.map((f) => (
                    <li key={f.post_id} className="break-words text-amber-900">
                      <Link
                        className="underline"
                        to={`/admin/boards/${boardId}/posts/${f.post_id}/edit`}
                      >
                        {f.title}
                      </Link>
                      : &lsquo;{f.before}&rsquo; — {f.reason}
                    </li>
                  ))}
                </ul>
                {result.failed > result.failures.length && (
                  <p className="mt-1 text-amber-800">
                    외 {(result.failed - result.failures.length).toLocaleString()}개
                  </p>
                )}
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={clearFailed}
                    disabled={field.is_required || busy}
                    onChange={(e) => setClearFailed(e.target.checked)}
                  />
                  <span className="text-amber-900">
                    바꿀 수 없는 글 {result.failed.toLocaleString()}개는 이 칸의 값을 비우고 진행합니다.
                    비운 값은 되돌릴 수 없습니다.
                    {field.is_required && ' (필수 칸이라 쓸 수 없습니다. 글을 먼저 고쳐 주세요.)'}
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button type="button" loading={busy} disabled={!result || blocked} onClick={submit}>
            유형 바꾸기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
