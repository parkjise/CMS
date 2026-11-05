import { useEffect, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useParams } from 'react-router'
import type { BoardField } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { CustomFieldInputs } from '@/components/boards/CustomFieldInputs'
import { FieldEditorForm } from '@/components/boards/FieldEditorForm'
import { useBoards } from '@/hooks/useBoards'
import {
  useBoardFields,
  useDeleteField,
  useReorderFields,
  useRestoreField,
} from '@/hooks/useBoardFields'
import { useCanEdit } from '@/hooks/useCanEdit'
import { type CustomValues, MAX_FIELDS, fieldTypeLabel, initialCustomValues } from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

interface FieldRowProps {
  field: BoardField
  index: number
  count: number
  canEdit: boolean
  onEdit: () => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
}

function FieldRow({ field, index, count, canEdit, onEdit, onMove, onDelete }: FieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.id,
    disabled: !canEdit,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 bg-white p-3"
    >
      {canEdit && (
        <button
          type="button"
          aria-label={`${field.label} 순서 끌기`}
          className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {field.label}
          {field.is_required && <span className="ml-1.5 text-xs text-red-600">필수</span>}
          {!field.is_visible && <span className="ml-1.5 text-xs text-slate-500">홈페이지에 안 보임</span>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {fieldTypeLabel(field.field_type)} · 값 있는 글 {field.value_count.toLocaleString()}개
        </p>
      </div>
      {canEdit && (
        <div className="flex items-center">
          <button
            type="button"
            aria-label={`${field.label} 위로`}
            disabled={index === 0}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${field.label} 아래로`}
            disabled={index === count - 1}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${field.label} 수정`}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${field.label} 삭제`}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  )
}

function FormPreview({ fields }: { fields: BoardField[] }) {
  const { control, formState } = useForm<CustomValues>({ defaultValues: initialCustomValues(fields, null) })
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">글쓰기 폼 미리보기</p>
      <p className="text-sm text-slate-500">제목 · 내용 칸은 항상 있습니다. 여기서 입력한 값은 저장되지 않습니다.</p>
      {fields.length > 0 ? (
        <CustomFieldInputs fields={fields} control={control} errors={formState.errors} />
      ) : (
        <p className="rounded-md bg-slate-50 p-4 text-center text-sm text-slate-500">추가한 칸이 없습니다.</p>
      )}
    </div>
  )
}

function FieldBuilder({ boardId }: { boardId: string }) {
  const canEdit = useCanEdit()
  const fieldsQuery = useBoardFields(boardId)
  const trashQuery = useBoardFields(boardId, { trash: true })
  const reorder = useReorderFields(boardId)
  const deleteField = useDeleteField(boardId)
  const restoreField = useRestoreField(boardId)
  const [fields, setFields] = useState<BoardField[]>([])
  // 'new' = 새 칸, 그 밖에는 고치는 칸 id
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    if (fieldsQuery.data) setFields(fieldsQuery.data)
  }, [fieldsQuery.data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const applyOrder = (next: BoardField[]) => {
    setFields(next)
    reorder.mutate(
      next.map((f) => f.id),
      { onError: (error) => toast.error(pickErrorMessage(error, '순서를 바꾸지 못했습니다.')) },
    )
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = fields.findIndex((f) => f.id === active.id)
    const to = fields.findIndex((f) => f.id === over.id)
    applyOrder(arrayMove(fields, from, to))
  }

  const remove = (field: BoardField) => {
    const impact =
      field.value_count > 0
        ? `값이 있는 글 ${field.value_count.toLocaleString()}개에서 이 칸이 보이지 않게 됩니다. 값은 지워지지 않고, 복원하면 돌아옵니다.`
        : '복원할 수 있습니다.'
    if (!window.confirm(`'${field.label}' 칸을 삭제할까요? ${impact}`)) return
    deleteField.mutate(field.id, {
      onSuccess: () => toast.success('칸을 삭제했습니다.'),
      onError: (error) => toast.error(pickErrorMessage(error, '삭제하지 못했습니다.')),
    })
  }

  const restore = (field: BoardField) =>
    restoreField.mutate(field.id, {
      onSuccess: () => toast.success('칸을 복원했습니다.'),
      onError: (error) => toast.error(pickErrorMessage(error, '복원하지 못했습니다.')),
    })

  if (fieldsQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
  }
  if (fieldsQuery.isError) return <p className="text-sm text-red-600">칸을 불러오지 못했습니다.</p>

  const trashed = trashQuery.data ?? []
  const atLimit = fields.length >= MAX_FIELDS

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        {fields.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-slate-100">
                  {fields.map((field, index) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      index={index}
                      count={fields.length}
                      canEdit={canEdit}
                      onEdit={() => setEditing(field.id)}
                      onMove={(delta) => applyOrder(arrayMove(fields, index, index + delta))}
                      onDelete={() => remove(field)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            아직 칸이 없습니다. 제목 · 내용 외에 더 받고 싶은 값이 있으면 칸을 추가하세요.
          </p>
        )}

        {editing && (
          <FieldEditorForm
            key={editing}
            boardId={boardId}
            field={fields.find((f) => f.id === editing)}
            onDone={() => setEditing(null)}
          />
        )}

        {canEdit && !editing && (
          <div>
            <Button type="button" variant="secondary" disabled={atLimit} onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              칸 추가
            </Button>
            {atLimit && <p className="mt-1.5 text-sm text-slate-500">칸은 게시판당 {MAX_FIELDS}개까지 만들 수 있습니다.</p>}
          </div>
        )}

        {trashed.length > 0 && (
          <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">삭제한 칸 {trashed.length}개</summary>
            <ul className="mt-3 space-y-2">
              {trashed.map((field) => (
                <li key={field.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-600">
                    {field.label} · {fieldTypeLabel(field.field_type)}
                  </span>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`${field.label} 복원`}
                      onClick={() => restore(field)}
                    >
                      복원
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <FormPreview key={fields.map((f) => `${f.id}:${f.field_type}`).join()} fields={fields} />
    </div>
  )
}

/** 필드 관리 (BM-04) */
export function BoardFieldsPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className="space-y-5 p-6 md:p-8">
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isSuccess && !board && <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>}
      {board?.system_key && <p className="text-sm text-slate-500">기본 게시판에는 칸을 추가할 수 없습니다.</p>}
      {board && !board.system_key && <FieldBuilder boardId={boardId} />}
    </div>
  )
}
