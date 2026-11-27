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
import { useState } from 'react'
import dayjs from 'dayjs'
import { Link, useNavigate } from 'react-router'
import { GripVertical, Layers, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Modal, toast } from '@cms/ui'
import { AddContentTypeModal } from '@/components/contents/AddContentTypeModal'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type ContentType,
  type ContentTypeLimits,
  useContentTypes,
  useDeleteContentType,
  useReorderContentTypes,
  useRestoreContentType,
} from '@/hooks/useContentTypes'
import { pickErrorMessage } from '@/lib/errorMessages'

type Tab = 'types' | 'trash'

/** 콘텐츠 유형 (T-255, 콘텐츠 관리 기획서 CM-03) — 유형 목록 · 한도 · 휴지통 */
export function ContentTypesPage() {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const { data, isLoading, isError } = useContentTypes()
  const [tab, setTab] = useState<Tab>('types')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<ContentType | null>(null)

  const enabled = data?.enabled ?? false
  const editable = enabled && canEdit
  const types = data?.types ?? []

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">콘텐츠 유형</h1>
          <p className="mt-1 text-sm text-slate-500">
            서비스 · FAQ · 연혁처럼 홈페이지에 넣을 정보의 종류와 입력 칸을 정합니다.
          </p>
        </div>
        {editable && data && <AddBar limits={data.limits} onAdd={() => setAdding(true)} />}
      </div>

      {data && !enabled && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" role="note">
          콘텐츠 관리가 아직 켜져 있지 않아요. 운영사에 사용을 요청해 주세요.
        </div>
      )}

      {enabled && (
        <div role="tablist" aria-label="유형 보기" className="flex gap-1 border-b border-slate-200">
          {(
            [
              ['types', `유형 ${types.length}`],
              ['trash', `휴지통 ${data?.trash.length ?? 0}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab === value
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
          ))}
        </ul>
      ) : isError || !data ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          콘텐츠 유형을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : tab === 'trash' ? (
        <TrashList types={data.trash} canRestore={editable} />
      ) : types.length === 0 ? (
        <EmptyTypes canCreate={editable && data.limits.can_create} onAdd={() => setAdding(true)} />
      ) : (
        <TypeList
          types={types}
          sortable={editable}
          onDelete={editable ? setDeleting : undefined}
        />
      )}

      {data && (
        <AddContentTypeModal
          open={adding}
          presets={data.presets}
          usedKeys={[...types, ...data.trash].map((t) => t.type_key)}
          onClose={() => setAdding(false)}
          onCreated={(type) => {
            setAdding(false)
            navigate(`/admin/contents/types/${type.id}`)
          }}
        />
      )}
      <DeleteTypeDialog type={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function AddBar({ limits, onAdd }: { limits: ContentTypeLimits; onAdd: () => void }) {
  const usage = limits.limit === null ? `${limits.used}개` : `${limits.used} / ${limits.limit}`
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">유형 {usage}</span>
        <Button type="button" onClick={onAdd} disabled={!limits.can_create}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          유형 추가
        </Button>
      </div>
      {limits.reason && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500" role="note">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {limits.reason}
        </p>
      )}
    </div>
  )
}

function EmptyTypes({ canCreate, onAdd }: { canCreate: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <Layers className="h-8 w-8 text-slate-300" aria-hidden="true" />
      <div>
        <p className="font-medium text-slate-900">아직 콘텐츠 유형이 없어요</p>
        <p className="mt-1 text-sm text-slate-500">
          서비스 소개 · 자주 묻는 질문 · 연혁 같은 시작용 유형으로 바로 시작할 수 있어요.
        </p>
      </div>
      {canCreate && (
        <Button type="button" variant="secondary" onClick={onAdd}>
          첫 유형 만들기
        </Button>
      )}
    </div>
  )
}

interface TypeListProps {
  types: ContentType[]
  sortable: boolean
  onDelete?: (type: ContentType) => void
}

function TypeList({ types, sortable, onDelete }: TypeListProps) {
  const reorder = useReorderContentTypes()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = types.findIndex((t) => t.id === active.id)
    const to = types.findIndex((t) => t.id === over.id)
    if (from === -1 || to === -1) return
    reorder.mutate(
      arrayMove(types, from, to).map((t) => t.id),
      { onError: () => toast.error('순서를 바꾸지 못했어요. 다시 시도해 주세요.') }
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={types.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2" aria-label="콘텐츠 유형 목록">
          {types.map((type) => (
            <TypeRow key={type.id} type={type} sortable={sortable} onDelete={onDelete} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function TypeRow({
  type,
  sortable,
  onDelete,
}: {
  type: ContentType
  sortable: boolean
  onDelete?: (type: ContentType) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: type.id,
    disabled: !sortable,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const detail = `/admin/contents/types/${type.id}`
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      {sortable ? (
        <button
          type="button"
          className="cursor-grab text-slate-400 hover:text-slate-600"
          aria-label={`${type.name} 순서 바꾸기`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-4" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <Link to={detail} className="truncate font-medium text-slate-900 hover:text-blue-700">
          {type.name}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500">
          {type.type_key} · 칸 {type.fields.length}개 · 콘텐츠 {type.item_count}개 (공개{' '}
          {type.published_count}) · 수정 {dayjs(type.updated_at).format('YYYY.MM.DD')}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Link
          to={detail}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          칸 편집
        </Link>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(type)}
            className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`${type.name} 휴지통으로`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

function TrashList({ types, canRestore }: { types: ContentType[]; canRestore: boolean }) {
  const restore = useRestoreContentType()
  if (types.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        휴지통이 비어 있어요.
      </div>
    )
  }
  return (
    <ul className="space-y-2" aria-label="휴지통">
      {types.map((type) => (
        <li
          key={type.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-700">{type.name}</p>
            <p className="text-xs text-slate-500">
              {type.type_key} · 칸 {type.fields.length}개
            </p>
          </div>
          {canRestore && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={restore.isPending && restore.variables === type.id}
              onClick={() =>
                restore.mutate(type.id, {
                  onSuccess: () => toast.success(`'${type.name}' 유형을 되살렸어요.`),
                  onError: (err) => toast.error(pickErrorMessage(err, '유형을 되살리지 못했어요.')),
                })
              }
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              복구
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function DeleteTypeDialog({ type, onClose }: { type: ContentType | null; onClose: () => void }) {
  const remove = useDeleteContentType()
  const hasItems = (type?.item_count ?? 0) > 0
  return (
    <Modal open={type !== null} onClose={onClose} title="유형을 휴지통으로 옮길까요?" size="sm">
      {type && (
        <div className="space-y-4">
          {hasItems ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="note">
              <strong>{type.name}</strong> 유형에 콘텐츠가 {type.item_count}개 남아 있어요.
              콘텐츠를 먼저 휴지통으로 옮겨야 유형을 지울 수 있어요.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{type.name}</strong> 유형과 칸 설정이 휴지통으로
              옮겨져요. 휴지통에서 되살릴 수 있어요.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {hasItems ? '닫기' : '취소'}
            </Button>
            {!hasItems && (
              <Button
                type="button"
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(type.id, {
                    onSuccess: () => {
                      toast.success(`'${type.name}' 유형을 휴지통으로 옮겼어요.`)
                      onClose()
                    },
                    onError: (err) => toast.error(pickErrorMessage(err, '유형을 옮기지 못했어요.')),
                  })
                }
              >
                휴지통으로
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
