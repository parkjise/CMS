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
import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Columns3,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useParams } from 'react-router'
import type { BoardField } from '@cms/types'
import { Button, toast } from '@cms/ui'
import { BoardDetailHeader } from '@/components/boards/BoardDetailHeader'
import { CARD, HELP_STRIP, PAGE, PANEL_LABEL, TAG_DEFAULT } from '@/components/boards/boardStyles'
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
import {
  type CustomValues,
  MAX_FIELDS,
  fieldTypeLabel,
  initialCustomValues,
} from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'

/** 모든 게시판에 늘 있는 칸 — 지우거나 바꿀 수 없다 (T-187) */
const BASE_FIELDS = [
  { label: '제목', key: 'title', required: true },
  { label: '내용', key: 'body', required: true },
  { label: '작성자', key: 'author', required: false },
  { label: '작성일', key: 'created_at', required: false },
  { label: '상단 고정', key: 'is_pinned', required: false },
  { label: '공개 상태', key: 'status', required: false },
]

const BaseFields = () => (
  <section className={CARD}>
    <h2 className={PANEL_LABEL}>
      기본 · 시스템 필드
      <small className="text-[11px] font-normal text-slate-400">
        {BASE_FIELDS.length}개 · 기본 제공
      </small>
    </h2>
    <ul className="divide-y divide-slate-100">
      {BASE_FIELDS.map((field) => (
        <li key={field.key} className="flex items-center gap-3 py-3 text-sm">
          <span className="min-w-0 flex-1">
            <span className="font-medium text-slate-800">{field.label}</span>
            <span className="ml-2.5 font-mono text-[11px] text-slate-400">{field.key}</span>
          </span>
          {field.required && <span className={TAG_DEFAULT}>필수</span>}
          <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
            삭제 불가
          </span>
        </li>
      ))}
    </ul>
  </section>
)

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
      className="flex items-center gap-2 bg-white py-3"
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
          {!field.is_visible && (
            <span className="ml-1.5 text-xs text-slate-500">홈페이지에 안 보임</span>
          )}
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
  const { control, formState } = useForm<CustomValues>({
    defaultValues: initialCustomValues(fields, null),
  })
  return (
    <div className={`space-y-4 ${CARD}`}>
      <h2 className={PANEL_LABEL}>
        글쓰기 폼 미리보기
        <small className="text-[11px] font-normal text-slate-400">사용자 정의 필드</small>
      </h2>
      <p className="text-xs text-slate-500">
        제목 · 내용 칸은 항상 있습니다. 여기서 입력한 값은 저장되지 않습니다.
      </p>
      {fields.length > 0 ? (
        <CustomFieldInputs fields={fields} control={control} errors={formState.errors} />
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          추가한 칸이 없습니다.
        </p>
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const applyOrder = (next: BoardField[]) => {
    setFields(next)
    reorder.mutate(
      next.map((f) => f.id),
      { onError: (error) => toast.error(pickErrorMessage(error, '순서를 바꾸지 못했습니다.')) }
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
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)]">
      <div className="min-w-0 space-y-5">
        <BaseFields />
        <section className={`space-y-4 ${CARD}`}>
          <h2 className={PANEL_LABEL}>
            사용자 정의 필드
            <small className="text-[11px] font-normal text-slate-400">
              {fields.length}개 · 최대 {MAX_FIELDS}개
            </small>
          </h2>
          {fields.length > 0 ? (
            <div className="overflow-hidden">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
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
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
              <Columns3 className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
              <p className="mt-3 text-sm font-medium text-slate-700">
                추가한 사용자 정의 필드가 없습니다.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                기본 필드만으로 게시판을 쓸 수 있어요. 제목 · 내용 외에 더 받고 싶은 값이 있을 때만
                칸을 추가하세요.
              </p>
            </div>
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
              <Button
                type="button"
                variant="secondary"
                disabled={atLimit}
                onClick={() => setEditing('new')}
              >
                <Plus className="h-4 w-4" aria-hidden />칸 추가
              </Button>
              {atLimit && (
                <p className="mt-1.5 text-sm text-slate-500">
                  칸은 게시판당 {MAX_FIELDS}개까지 만들 수 있습니다.
                </p>
              )}
            </div>
          )}
        </section>

        {trashed.length > 0 && (
          <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">
              삭제한 칸 {trashed.length}개
            </summary>
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

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
        <FormPreview key={fields.map((f) => `${f.id}:${f.field_type}`).join()} fields={fields} />
        <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3.5 text-xs leading-relaxed text-slate-600">
          <strong className="font-medium text-slate-700">어떤 정보를 추가할 수 있나요?</strong>
          <br />
          진료 과목, 행사 기간, 관련 링크처럼 게시판에 필요한 정보를 추가해 보세요.
        </p>
      </aside>
    </div>
  )
}

/** 필드 관리 (BM-04) */
export function BoardFieldsPage() {
  const { boardId = '' } = useParams()
  const boardsQuery = useBoards()
  const board = boardsQuery.data?.find((b) => b.id === boardId)

  return (
    <div className={PAGE}>
      <BoardDetailHeader boardId={boardId} />
      {boardsQuery.isSuccess && !board && (
        <p className="text-sm text-slate-500">게시판을 찾을 수 없습니다.</p>
      )}
      {board?.system_key && (
        <p className="text-sm text-slate-500">기본 게시판에는 칸을 추가할 수 없습니다.</p>
      )}
      {board && !board.system_key && <FieldBuilder boardId={boardId} />}
      {board && !board.system_key && (
        <p className={HELP_STRIP}>
          <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-medium text-slate-600">
              검색창이나 페이지 번호는 필드로 만들 필요가 없어요.
            </strong>{' '}
            화면에 보이는 방식은 게시판 디자인에서 정합니다.
          </span>
        </p>
      )}
    </div>
  )
}
